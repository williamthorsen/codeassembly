## File access

- When given an exact file path, use the read tool directly. Do not search for the file first.
- If the read attempt returns "file does not exist", STOP and report the missing path; do not attempt to find the file by searching. A missing file at an exact path usually indicates a configuration or environment problem, not a wrong filename.
