# Step 1: Parse Arguments

Read the user's input after `/printing-press-score`. The input is **free-form**, interpret intent, don't enforce syntax.

**Noise words to strip:** `compare`, `vs`, `versus`, `and`, `against`, `with`, `to`

After stripping noise words, count the remaining tokens:

- **0 tokens** → Rescore Current mode
- **1 token** → Score Single mode
- **2 tokens** → Compare mode
