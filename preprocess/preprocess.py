import guitarpro
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


def ticks_to_seconds(ticks, ticks_per_beat, tempo, denominator):
    """
    Convert ticks to seconds (denominator-aware).
    """
    quarter_per_unit = 4 / denominator
    ticks_per_quarter = ticks_per_beat / quarter_per_unit
    seconds_per_quarter = 60.0 / tempo
    return (ticks / ticks_per_quarter) * seconds_per_quarter


def parse_gp5(input_file, output_file):
    song = guitarpro.parse(input_file)

    tempo = song.tempo

    output = {
        "meta": {
            "title": song.title or Path(input_file).stem,
            "tempo": tempo,
            "timeSignature": [
                song.tracks[0].measures[0].timeSignature.numerator,
                song.tracks[0].measures[0].timeSignature.denominator.value,
            ],
            "tuning": STANDARD_TUNING,
        },
        "tracks": []
    }

    for track in song.tracks:
        if track.isPercussionTrack:
            continue

        track_data = {
            "name": track.name,
            "notes": []
        }

        for measure in track.measures:
            ts = measure.timeSignature
            numerator = ts.numerator
            denominator = ts.denominator.value

            ticks_per_beat = measure.length / numerator

            for voice in measure.voices:
                for beat in voice.beats:
                    absolute_ticks = measure.start + beat.start

                    start_seconds = ticks_to_seconds(
                        absolute_ticks,
                        ticks_per_beat,
                        tempo,
                        denominator
                    )

                    duration_seconds = ticks_to_seconds(
                        beat.duration.time,
                        ticks_per_beat,
                        tempo,
                        denominator
                    )

                    for note in beat.notes:
                        string_number = note.string
                        fret = note.value
                        velocity = note.velocity / 127.0

                        # MIDI pitch from string + fret
                        string_index = 6 - string_number
                        midi_pitch = STANDARD_TUNING[string_index] + fret

                        note_name = midi_to_note_name(midi_pitch)

                        track_data["notes"].append({
                            "id": len(track_data["notes"]),
                            "duration": duration_seconds,
                            "midi": midi_pitch,
                            "name": note_name,
                            "time": start_seconds,
                            "velocity": velocity,
                            "string": string_number,
                            "fret": fret,
                        })

        output["tracks"].append(track_data)

    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Exported JSON to {output_file}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        for file in DEFAULT_INPUT_DIR.glob("*.gp5"):
            output_file = DEFAULT_OUTPUT_DIR / (file.stem + ".json")
            parse_gp5(file, output_file)
    else:
        parse_gp5(Path(sys.argv[1]), Path(sys.argv[2]))