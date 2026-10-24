# Error Handling

- If the cli-printing-press binary is not on PATH → show install instructions: `go install github.com/mvanhorn/cli-printing-press/v4/cmd/cli-printing-press@latest`
- If the scorecard command fails → report the error with the full stderr output
- If a CLI directory doesn't exist → report which name couldn't be resolved
- If JSON parsing fails → show the raw output and report the parsing error
