# How to install these rules in Google Antigravity

## 1. Copy the folders into your repo root
```
resin-art-assistant/
  .agent/
    rules/
      00-core.md        ← Always On
      01-stack.md       ← Always On
      02-database.md    ← Glob: **/*.ts
      03-ai-pipeline.md ← Glob: **/ai/**
    workflows/
      build.md          ← Manual: /build
  CLAUDE.md             ← full spec (already there)
```

## 2. Open Antigravity and configure each rule

Open the Agent panel → "..." menu → Customizations → Rules

For each rule file, set the activation mode:

| File | Mode | Glob (if any) |
|---|---|---|
| 00-core.md | Always On | — |
| 01-stack.md | Always On | — |
| 02-database.md | Glob | **/*.ts |
| 03-ai-pipeline.md | Glob | **/ai/** |

## 3. Register the workflow

Agent panel → "..." → Customizations → Workflows
The build.md file should appear as /build

## 4. Start your first session

Open a new agent chat and type:

```
Read CLAUDE.md in the repo root fully.
Then run /build and start from Step 1.
```

## 5. Verify rules loaded

Ask the agent:
```
Summarise the project rules you are currently following.
```

It should mention: demo mode, two roles (admin/staff), business_id on every table,
state check before AI reply, never invent facts, argon2id for passwords.

## Character counts (within Antigravity limits)
- 00-core.md:         ~2,700 chars
- 01-stack.md:        ~3,900 chars
- 02-database.md:     ~3,400 chars
- 03-ai-pipeline.md:  ~3,700 chars
- build.md:           ~7,200 chars (workflow, not always-on)

Total always-on context: ~13,700 chars across 4 files.
