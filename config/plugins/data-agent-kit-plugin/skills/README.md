# What are Agent Skills?

Skills are an open standard for extending agent capabilities with reusable
packages of knowledge. A skill is a directory containing a `SKILL.md` file with
instructions that the agent can follow when working on specific tasks.

Each skill contains:

-   Instructions for how to approach a specific type of task
-   Best practices and conventions to follow
-   Optional scripts and resources the agent can use

## Skill folder structure

While SKILL.md is the only required file, you can include additional resources:

```bash
third_party/data_agent_kit/data_agent_common/skills/my-skill/
├─── SKILL.md       # Main instructions (required)
├─── scripts/       # Helper scripts (optional)
├─── examples/      # Reference implementations (optional)
└─── resources/     # Templates and other assets (optional)
```

The directory names are not strict (e.g. `references/` is permitted instead of
`resources/`).

## Adding New Skills

1.  **Create your skill package**: Create a new folder in `skills/` using
    underscores (e.g., `my_new_skill/`).
1.  **Add a `SKILL.md` file**: inside the new folder. The `name` in the YAML
    frontmatter MUST use hyphens (e.g., `name: "my-new-skill"`).
1.  **Create a BUILD file**: Inside your skill folder, use the `agent_skill`
    macro to explicitly declare your `definition` (`SKILL.md`) and any
    `resources` (e.g., example files, scripts).

    ```python
    load("//third_party/data_agent_kit/data_agent_common/internal:skill_defs.bzl", "agent_skill")

    package(default_visibility = ["//third_party/data_agent_kit/data_agent_common:__subpackages__"])

    agent_skill(
        name = "my_new_skill",
        definition = "SKILL.md",
        resources = [
            "resources/<resource-name>.md",
            "scripts/<script-name>.md",
            # ...
        ],
    )
    ```

1.  **Register your skill**: Add your new skill target to the `skills` list of
    the `agent_skills_bundle` rule in `skills/BUILD`.

    ```python
    ...
    agent_skills_bundle(
        name = "antigravity_agent_skills",
        skills = PLATFORM_INDEPENDENT_SKILLS + [
            ...
            "//third_party/data_agent_kit/data_agent_common/skills/my_skill:my_skill",
        ],
    )
    ```

### Skill Dependencies

If your skill needs to instruct the agent to use another skill, you must
explicitly track that dependency:

1.  **Markdown Syntax**: In your `SKILL.md` or resource files, refer to the
    other skill using the `@skill:<name>` format (e.g.,
    `@skill:bigquery`). This is intuitive for the LLM and
    strictly parsed by our build tools.
2.  **BUILD Declaration**: Add the referenced skill to the `deps` list of your
    `agent_skill` target in the `BUILD` file.

    ```python
    agent_skill(
        name = "my_new_skill",
        definition = "SKILL.md",
        resources = [ ... ],
        deps = [
            "//third_party/data_agent_kit/data_agent_common/skills/bigquery:bigquery",
        ],
    )
    ```

Automated tests will automatically parse your markdown and fail if your `deps`
list doesn't exactly match your `@skill:` references! This transitive dependency
system ensures that if a user installs your skill, the agent will also have all
the skills your instructions tell it to use.

### Verification

You can verify that your new files are correctly packaged by running the
completeness test. If you add a file to disk but forget to list it in your
`BUILD` file's `resources` array, this test will fail:

```bash
blaze test //third_party/data_agent_kit/data_agent_common/skills/...
```

### Local Development & Prompt Iteration

If you are manually editing files in `~/.gemini` (e.g., iterating on a skill
prompt) and you don't want the extension to overwrite your changes on every
reload:

1.  Open VS Code **Settings** (`Cmd+,`).
2.  Search for **"Antigravity Sync"**.
3.  **Uncheck** `Datacloud > Agent > Skills: Auto Update`.
4.  The extension will now skip the synchronization logic until you re-enable
    this setting.

Additionally, you can use the `Datacloud > Agent > Skills: Install Location`
setting to deploy skills locally to your current workspace instead of globally.
If you switch this setting from `global` to `workspace`, the extension will
automatically uninstall your global skills and begin using the workspace path
(and vice versa).

### Troubleshooting

-   **Output Channel**: Check the **"DataCloud Agent Skill Installer"** channel
    in the VS Code Output tab for detailed execution logs.
-   **Manual Force**: You can force a re-installation by running the command
    **"Google Cloud Data Agent Kit: Install Agent Skills"** or by deleting the
    `.datacloud_skills_manifest` file in the target directory.
