**vite-plugin-react-ai-bridge**

Custom Vite plugin that allows you to edit React components directly from your browser. Click an element, type a prompt, and update your code in real-time.

https://github.com/user-attachments/assets/3515731c-cbea-48d1-a894-5bd898143af3

## ✨ Why Custom Plugin?

- Low Token Usage - You only pay for the context you want
- Less Hellucination - AI models often hallucinate when overwhelmed by a massive context window. 
- Context Switching - You dont have to manually find the file and line number in your IDE to start and edit

## 🚀 Getting Started
1. Install your favourite agent CLI. (Cursor , gemini , codex).
2. Ensure that you have the neccasary vite and react plugin installed
 ```html
npm install -D @vitejs/plugin-react
```
3. Configure `vite.config.ts`.
  
   **Part A: source metadata injection (Babel)**
 
   This plugin extracts the original file path and line number for each component.
   ``` js
   // 1. Metadata Plugin: Injects data-source-file and data-source-line
    const metadataPlugin = react({
    babel: {
      plugins: [
        function (babel) {
          const { types: t } = babel;
          return {
            visitor: {
              JSXOpeningElement(path, state) {
                if (path.node.loc) {
                  const { filename } = state.file.opts;
                  const { line, column } = path.node.loc.start;
  
                  const addAttr = (name, value) => {
                  if (!path.node.attributes.some(attr => attr.name?.name === name)) {
                    path.node.attributes.push(
                      t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(String(value)))
                    );
                  }
                };

                addAttr("data-source-file", filename);
                addAttr("data-source-line", line);
                addAttr("data-source-column", column);
              }
            },
          },
        };
      },
    ],
    },
    });
   ```

   **Part B: The CLI Bridge (Vite Server (Using Cursor CLI here))**

     ``` js
     import { exec, spawn } from 'node:child_process';

    // 2. Bridge Plugin: Connects Browser to your AI CLI
    const cliBridgePlugin = {
       name: 'cli-bridge',
    configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/__ai-cli" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { prompt, file, line, elementType } = JSON.parse(body);

              const isWin = os.platform() === "win32";
              const safePrompt = prompt.replace(/'/g, "'\\''");

              const executeAgent = (targetPath: string) => {
                const command = isWin ? "wsl" : "bash";
                const agentCmd = `agent -p --force '${safePrompt} for ${elementType} @${targetPath} on line ${line}' --model auto`;
                const commandArgs = isWin
                  ? ["bash", "-lc", agentCmd]
                  : ["-lc", agentCmd];

                console.log(`\x1b[36m[Executing]\x1b[0m ${command} ${commandArgs.join(" ")}`);

                const child = spawn(command, commandArgs, { stdio: "inherit" });

                child.on("close", (code) => {
                  if (code !== 0) {
                    console.error(`\x1b[31m[Cursor Error]\x1b[0m Command exited with code ${code}`);
                    if (!res.writableEnded) {
                      res.statusCode = 500;
                      res.end(JSON.stringify({ status: "error", message: `Exit code ${code}` }));
                    }
                    return;
                  }
                  console.log(`\x1b[32m[Cursor Success]\x1b[0m Changes applied successfully`);
                  if (!res.writableEnded) {
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ status: "success" }));
                  }
                });

                child.on("error", (err) => {
                  console.error(`\x1b[31m[Spawn Error]\x1b[0m ${err.message}`);
                  if (!res.writableEnded) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ status: "error", message: err.message }));
                  }
                });
              };

              if (isWin) {
                // for Windows we need the WSL path to avoid shell quoting issues
                const normalizedFileForWslPath = file.replace(/\\/g, "/");
                exec(`wsl wslpath -u "${normalizedFileForWslPath}"`, (pathError, wslPath) => {
                  if (pathError) {
                    console.error(`\x1b[31m[Path Error]\x1b[0m ${pathError.message}`);
                    if (!res.writableEnded) {
                      res.statusCode = 500;
                      res.end(JSON.stringify({ status: "error", message: "Failed to convert path" }));
                    }
                    return;
                  }
                  executeAgent(wslPath.trim());
                });
              } else {
                executeAgent(file);
              }
          } catch (e) {
            res.statusCode = 400;
            res.end("Invalid JSON");
          }
        });
      } else {
        next();
      }
    });
    },
    };
     ```
4. Create a file named `Inspector.tsx` and paste this.  
   ```jsx
   // Inspector.tsx (Minimal Implementation)
    import React, { useState, useCallback } from "react";

    const InspectorBridge = () => {
    const [isActive, setIsActive] = useState(false);
    const [selectedElement, setSelectedElement] = useState(null);

    // 1. Capture the element's source metadata on click
    const handleClick = useCallback((e) => {
        if (!isActive) return;
        const target = e.target.closest("[data-source-file]");
        if (target) {
            setSelectedElement({
                file: target.getAttribute("data-source-file"),
                line: target.getAttribute("data-source-line"),
            });
        }
    }, [isActive]);

    // 2. Send the prompt and context to the Vite server
    const sendToAI = async (prompt) => {
        await fetch("/__ai-bridge", {
            method: "POST",
            body: JSON.stringify({ prompt, ...selectedElement, tool: 'cursor' }),
        });
    };

    return (
        <div onClickCapture={handleClick}>
            {/* [YOUR_UI_COMPONENTS_HERE] 
                Render your toggle button and prompt input form here.
            */}
        </div>
    );
    };
   ```
5. Import this file to `main.tsx` and make sure its available only during development mode.
   ```js
   {import.meta.env.DEV && <Inspector />}
   ```

   Personally i would recommend avoid using gemini-cli as the startup time is very high. [Refer this](https://github.com/google-gemini/gemini-cli/issues/10726)

## 🛠️ Troubleshooting  

<details>
<summary><b>The AI CLI command isn't firing</b></summary>

* Ensure you have WSL installed and configured.
* Check if `agent` is in your Linux `$PATH`.
</details>

<details>
<summary><b>Missing data-source attributes</b></summary>

* Make sure Part A of the config (Babel plugin) is active.
* Restart your Vite dev server to clear the cache.
</details>

   
