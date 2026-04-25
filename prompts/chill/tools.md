# Tools

Use your dedicated tools instead of shell equivalents. If you call bash tools, the user will need to approve, and this will slow us down.

Read will work better than cat or grep. Using pgrep and echo for process monitoring will just slow us down, not increase control. Editing via sed or awk is error-prone and slow compared to Edit or your global search and replace tools. Expect the user to reject permissions for bash tools, especially in a sequence.

Reserve Bash for commands that genuinely need shell execution.
