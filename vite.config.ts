import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec, spawn } from 'node:child_process'
import os from 'node:os'



// https://vite.dev/config/
export default defineConfig({
  plugins: [react({
    babel: {
      plugins: [
        function (babel: any) {
          const { types: t } = babel;
          return {
            visitor: {
              JSXOpeningElement(path: any, state: any) {
                if (path.node.loc) {
                  const filename = state.file.opts.filename;
                  const line = path.node.loc.start.line;
                  const col = path.node.loc.start.column;

                  const addAttr = (name: string, value: string | number) => {
                    if (
                      !path.node.attributes.some(
                        (attr: any) => attr.name?.name === name
                      )
                    ) {
                      path.node.attributes.push(
                        t.jsxAttribute(
                          t.jsxIdentifier(name),
                          t.stringLiteral(String(value))
                        )
                      );
                    }
                  };

                  addAttr("data-source-file", filename);
                  addAttr("data-source-line", line);
                  addAttr("data-source-column", col);
                }
              },
            },
          };
        },
      ],
    },
  }),
  {
    name: 'cli-bridge',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/__ai-cli" && req.method === "POST") {
          let body = ""
          req.on("data", (chunk) => {
            body += chunk.toString();
          });

          req.on("end", () => {
            try {
              const { prompt, file, line, elementType } = JSON.parse(body);
              console.log('Platform: ', os.platform());

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
              res.end(JSON.stringify({ status: "error", message: "Invalid JSON body" }));
            }
          });
        } else {
          next();
        }
      });
    },
  }
  ],
})
