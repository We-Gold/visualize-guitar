# Usage

RUN FROM INSIDE THE `preprocess` DIRECTORY

**Without arguments (default):**

Reads all files in `data` and outputs to json files in `public/data`.

```bash
uv run preprocess.py
```

**With arguments:**

```bash
uv run preprocess.py input.gp5 output.json
```