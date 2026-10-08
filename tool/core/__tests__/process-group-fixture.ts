// Tiến trình giả lập server: mở một tiến trình con trong nhóm riêng, theo dõi nó và cài handler dọn như `main()` của server.
// In "pid <số>" của tiến trình con ra stdout để test kiểm tra nó có còn sống không.
import { spawn } from "node:child_process";
import { installProcessCleanup, killAllGroups, trackGroup } from "../process-group.ts";

const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
trackGroup(child);
installProcessCleanup(async () => {
  killAllGroups("SIGTERM");
});
console.log(`pid ${child.pid}`);
setInterval(() => {}, 1000);
