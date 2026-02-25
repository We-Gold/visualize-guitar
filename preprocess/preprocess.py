import guitarpro
import mido
from mido import MidiFile
import json
import sys
from pathlib import Path

DEFAULT_INPUT_DIR = Path("../data")
DEFAULT_OUTPUT_DIR = Path("../public/data")

# Standard tuning MIDI numbers (low E to high E)
STANDARD_TUNING = [40, 45, 50, 55, 59, 64]

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi_to_note_name(midi):
    """
    Convert MIDI number to note name with octave.
    MIDI 60 -> C4
    Formula:
        octave = (midi // 12) - 1
        name = NOTE_NAMES[midi % 12]
    """
    octave = (midi // 12) - 1
    name = NOTE_NAMES[midi % 12]
    return f"{name}{octave}"

def parse_gp5_and_midi(input_gp5, input_midi, output_file):
    """
    Parses a Guitar Pro 5 file and its corresponding MIDI file, then exports combined data as JSON.
    This is useful for extracting accurate timing from MIDI while keeping note info from GP5.

    This function takes the note data from the midi file and enriches it with string and fret information from the GP5 file.

    Right now, it just associates a string and fret position with every note in the MIDI file, which is not ideal. A more robust implementation would attempt to match MIDI notes to GP5 notes based on timing and pitch, but that is non-trivial and may require heuristics to handle discrepancies between the two files.
    """

    ### Part 1: Create a mapping of MIDI notes from the GP5 file with their string and fret info
    # Note: We do not record the timing from the GP5 file, as it may not be accurate. We will rely on the MIDI file for timing.
    # Example: MIDI note C4 (60) is played on string 3 fret 5 in the GP5 file. We want to associate MIDI note 60 with string 3 fret 5.

    gp5_song = guitarpro.parse(input_gp5)
    gp5_note_mapping = {}  # Key: (midi_pitch), Value: {string, fret}

    for track in gp5_song.tracks:
        if track.isPercussionTrack:
            continue

        for measure in track.measures:
            for voice in measure.voices:
                for beat in voice.beats:
                    for note in beat.notes:
                        string_number = note.string
                        fret = note.value

                        string_index = 6 - string_number
                        midi_pitch = STANDARD_TUNING[string_index] + fret

                        if midi_pitch not in gp5_note_mapping:
                            gp5_note_mapping[midi_pitch] = {"string": string_number, "fret": fret}
                        if midi_pitch in gp5_note_mapping:
                            # Log only if the same MIDI pitch is mapped to different string/fret positions, which indicates a potential issue
                            existing_mapping = gp5_note_mapping[midi_pitch]
                            if existing_mapping["string"] != string_number or existing_mapping["fret"] != fret:
                                print(f"Warning: MIDI pitch {midi_pitch} is mapped to multiple string/fret positions in GP5:")
                                print(f"  Existing mapping: string {existing_mapping['string']}, fret {existing_mapping['fret']}")
                                print(f"  New mapping: string {string_number}, fret {fret}")

    ### Part 2: Parse the MIDI file and create the output JSON, enriching MIDI notes with string/fret info from the GP5 mapping
    midi_song = MidiFile(input_midi)

    output = {
        "meta": {
            "title": Path(input_gp5).stem,
            "tempo": None,  # We will extract tempo from MIDI file
            "timeSignature": None,  # We will extract time signature from MIDI file
            "tuning": STANDARD_TUNING,
        },
        "tracks": []
    }

    for track in midi_song.tracks:
        note_data_list = []
        note_queue = {}  # Maps MIDI pitch -> list of pending note_on events
        absolute_time_seconds = 0.0
        absolute_ticks = 0
        tempo_usec = 500000  # Default tempo: 120 BPM = 500000 microseconds per beat
        channel_percussion = set()  # Track which channels are percussion (MIDI channel 9)

        for msg in track:
            # Accumulate absolute time from delta time
            absolute_time_seconds += mido.tick2second(msg.time, midi_song.ticks_per_beat, tempo_usec)
            absolute_ticks += msg.time

            if msg.type == "set_tempo":
                tempo_usec = msg.tempo
                output["meta"]["tempo"] = mido.tempo2bpm(msg.tempo)
            elif msg.type == "time_signature":
                output["meta"]["timeSignature"] = [msg.numerator, msg.denominator]
            elif msg.type == "note_on":
                if msg.velocity > 0:
                    # Note on: store the onset
                    midi_pitch = msg.note
                    velocity = msg.velocity / 127.0
                    
                    # Track percussion channel
                    if msg.channel == 9:
                        channel_percussion.add(msg.channel)
                    
                    # Add to note queue (FIFO per pitch)
                    if midi_pitch not in note_queue:
                        note_queue[midi_pitch] = []
                    note_queue[midi_pitch].append({
                        "absolute_time": absolute_time_seconds,
                        "absolute_ticks": absolute_ticks,
                        "velocity": velocity,
                        "channel": msg.channel,
                        "midi_pitch": midi_pitch
                    })
                else:
                    # note_on with velocity 0 is treated as note_off
                    midi_pitch = msg.note
                    if midi_pitch in note_queue and len(note_queue[midi_pitch]) > 0:
                        note_on_data = note_queue[midi_pitch].pop(0)  # FIFO
                        duration = absolute_time_seconds - note_on_data["absolute_time"]
                        duration_ticks = absolute_ticks - note_on_data["absolute_ticks"]
                        
                        # Skip percussion channel notes
                        if note_on_data["channel"] != 9:
                            note_data = {
                                "duration": duration,
                                "durationTicks": duration_ticks,
                                "midi": midi_pitch,
                                "name": midi_to_note_name(midi_pitch),
                                "ticks": note_on_data["absolute_ticks"],
                                "time": note_on_data["absolute_time"],
                                "velocity": note_on_data["velocity"],
                                "string": None,  # To be filled from GP5 mapping
                                "fret": None,    # To be filled from GP5 mapping
                            }
                            
                            if midi_pitch in gp5_note_mapping:
                                note_data["string"] = gp5_note_mapping[midi_pitch]["string"]
                                note_data["fret"] = gp5_note_mapping[midi_pitch]["fret"]
                            
                            note_data_list.append(note_data)
                    else:
                        print(f"Warning: note_off for MIDI pitch {midi_pitch} without matching note_on")
            elif msg.type == "note_off":
                midi_pitch = msg.note
                if midi_pitch in note_queue and len(note_queue[midi_pitch]) > 0:
                    note_on_data = note_queue[midi_pitch].pop(0)  # FIFO
                    duration = absolute_time_seconds - note_on_data["absolute_time"]
                    duration_ticks = absolute_ticks - note_on_data["absolute_ticks"]
                    
                    # Skip percussion channel notes
                    if note_on_data["channel"] != 9:
                        note_data = {
                            "duration": duration,
                            "durationTicks": duration_ticks,
                            "midi": midi_pitch,
                            "name": midi_to_note_name(midi_pitch),
                            "ticks": note_on_data["absolute_ticks"],
                            "time": note_on_data["absolute_time"],
                            "velocity": note_on_data["velocity"],
                            "string": None,  # To be filled from GP5 mapping
                            "fret": None,    # To be filled from GP5 mapping
                        }
                        
                        if midi_pitch in gp5_note_mapping:
                            note_data["string"] = gp5_note_mapping[midi_pitch]["string"]
                            note_data["fret"] = gp5_note_mapping[midi_pitch]["fret"]
                        
                        note_data_list.append(note_data)
                else:
                    print(f"Warning: note_off for MIDI pitch {midi_pitch} without matching note_on")

        # Sort notes by start time
        note_data_list.sort(key=lambda note: note["time"])
        
        output["tracks"].append({
            "name": track.name if track.name else "Unnamed Track",
            "notes": note_data_list
        })

    # Convert to Path if string
    if isinstance(output_file, str):
        output_file = Path(output_file)
    
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)
    
if __name__ == "__main__":
    if len(sys.argv) != 4:
        DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        # Find all folders within the input directory. For each folder, find the .gp5 file and the .mid file regardless of their names, and parse them together. 
        # Output the JSON file with the same name as the folder.
        for folder in DEFAULT_INPUT_DIR.iterdir():
            if folder.is_dir():
                gp5_file = None
                midi_file = None

                for file in folder.iterdir():
                    if file.suffix == ".gp5":
                        gp5_file = file
                    elif file.suffix == ".mid":
                        midi_file = file

                if gp5_file and midi_file:
                    output_file = DEFAULT_OUTPUT_DIR / (folder.name + ".json")
                    print(f"Processing folder '{folder.name}': GP5='{gp5_file.name}', MIDI='{midi_file.name}' -> Output='{output_file.name}'")
                    parse_gp5_and_midi(gp5_file, midi_file, output_file)
                else:
                    print(f"Warning: Folder '{folder.name}' does not contain both a .gp5 and a .mid file. Skipping.")
    else:
        parse_gp5_and_midi(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))