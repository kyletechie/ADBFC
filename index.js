import { execSync } from "child_process";
import inquirer from "inquirer";
import { exit } from "process";

const INFO_COLOR = "\x1b[1;33m";
const SUCCESS_COLOR = "\x1b[1;32m"; 
const ERROR_COLOR = "\x1b[1;31m";
const PAIRING_COLOR = "\x1b[1;34m";
const CONNECTING_COLOR = PAIRING_COLOR;
const screenBlockList = ["NotificationShade", "com.android.settings"];

const port = process.argv[2];
const pairPort = process.argv[3];
const pairCode = process.argv[4];
const killServer = process.argv[5] === "1";
const antiturnoff = process.argv[6] || "1";

if (!port || !pairPort || !pairCode) {
  console.log(`${INFO_COLOR}[INFO] ${SUCCESS_COLOR}Usage: npm start <port> <pairPort> <pairCode> <killServer: 0>
Arguments:
  <port>: Wireless IPv4 Port (required)
  <pairPort>: Wireless IPv4 Pairing Port (required)
  <pairCode>: Wireless Pairing Code (required)
  <killServer>: Kill ADB server before starting it. 
    - Useful for fixing the "failed to connect" issue. 
    - Avoid if multiple devices are connected.
    - Use if connecting only one device.
    Values: 0 = false (default), 1 = true
  <antiturnoff>: Values: 1 = yes (default), 0 = no`);
  exit(0);
}

let ifconfigOutput = execSync("ifconfig", { stdio: "pipe", shell: true }).toString();

const delay = (ms) => {return new Promise(res => setTimeout(res, ms))};

function run(cmd, opts = { stdio: "inherit", shell: true }) {
  try {
    const output = execSync(cmd, opts);
    return opts.stdio === "pipe" ? output.toString() : "";
  }
  catch (e) {
    console.log(`${ERROR_COLOR}[ERROR] ${SUCCESS_COLOR}Error running "${cmd}":`, e.message);
    process.exit(1);
  }
}

function antiTurnOff(){
  console.log(`${INFO_COLOR}[INFO] ${SUCCESS_COLOR}Android Debug Bridge (ATO) is Running...`);
  while (true) {
    const now = new Date().toLocaleString();
    //const output = "mFocusedApp=Window{hskahj sishkssnsj sishsjss com.facebook.orca}"
    const output = run(`adb shell dumpsys window`, { stdio: "pipe" });
    const currentFocus = output.match(/(mCurrentFocus|mFocusedApp)=\S+{([^}]+)}/);
    const currentScreen = currentFocus ? currentFocus[0] : run(`adb shell dumpsys statusbar`, { stdio: "pipe" })
    screenBlockList.forEach((blockList) => {
      if (currentScreen.includes(blockList)) {
        run(`adb shell input keyevent HOME`);
        console.log(`${INFO_COLOR}${now} [INFO] ${SUCCESS_COLOR}Blocking ${blockList}.`);
      }
    });
  }
}

async function adbConnect(port, pairPort, pairCode, ipv4) {
  process.stdout.write(`${INFO_COLOR}[INFO] ${SUCCESS_COLOR}Starting ADB Server...\n`);
  if (killServer){
    run("adb kill-server", { stdio: "ignore" });
    await delay(3000);
  }
  run("adb start-server");

  console.log(`${PAIRING_COLOR}[PAIRING] ${SUCCESS_COLOR}Pairing > ${ipv4}:${pairPort} with Pairing Code: ${pairCode}`);
  run(`adb pair ${ipv4}:${pairPort} ${pairCode}`, { stdio: "ignore" });
  console.log(`${PAIRING_COLOR}[PAIRING] ${SUCCESS_COLOR}Device Successfully Paired`);

  console.log(`${CONNECTING_COLOR}[CONNECTING] ${SUCCESS_COLOR}Connecting to ${ipv4}:${port}...`);
  const status = run(`adb connect ${ipv4}:${port}`, { stdio: "pipe" });

  if (status.includes("failed")) {
    console.log(`${ERROR_COLOR}[ERROR] ${SUCCESS_COLOR}Failed to connect to ${ipv4}.`);
    console.log(`${INFO_COLOR}[INFO] ${SUCCESS_COLOR}Try setting the "killServer" argument to 1.`);
    console.log(`${INFO_COLOR}[WARNING] ${SUCCESS_COLOR}If multiple devices are connected, setting "killServer" to 1 may disconnect all devices.`);
    console.log(`${INFO_COLOR}[INFO] ${SUCCESS_COLOR}To avoid this, simply rerun the script and get a new port, pairPort, and pairCode for the target device. :D`);
    exit(1);
  }

  console.log(`${INFO_COLOR}[SUCCESS] ${SUCCESS_COLOR}Successfully Connected to ${ipv4}:${port}.`);
  console.log(`${INFO_COLOR}[INFO] ${SUCCESS_COLOR}Happy Trolling/Hacking ~Kairu`);
}

function getWlan0IPv4() {
  const wlan0Index = ifconfigOutput.indexOf("wlan0");
  
  if (wlan0Index !== -1) {
    ifconfigOutput = ifconfigOutput.slice(wlan0Index);
    
    for (const line of ifconfigOutput.split("\n")) {
      if (line.includes("inet")) {
        const IPv4Address = line.match(/\d+\.\d+\.\d+\.\d+/);
        if (IPv4Address) {
          return IPv4Address[0];
        } else {
          throw new Error("Wlan0 IPv4 Address Not Found.");
        }
      }
    }
  } else {
    throw new Error("Unable to Find Wlan0 Interface.");
  }
}

function getIPv4Devices() {
  try {
    let devices = [];
    console.log(`${INFO_COLOR}[INFO] ${SUCCESS_COLOR}Fetching Wlan0 IPv4 Address...`);
    const wlanIPv4 = getWlan0IPv4().trim();
    const nmapScanOutput = execSync(`nmap -sn -n ${wlanIPv4}/24`, { stdio: "pipe", shell: true }).toString();
    const scanReport = nmapScanOutput.match(/Nmap scan report for .*?\n/g) || [];

    if (scanReport.length === 0) {
      console.log(`${ERROR_COLOR}[ERROR] ${SUCCESS_COLOR}No devices found on the network.`);
      return devices;
    }
    
    scanReport.forEach((output) => {
      const outputArray = output.split(" ");
      const ipv4 = outputArray.filter(Boolean)[outputArray.length - 1].trim();
      if (ipv4 !== wlanIPv4) {
        devices.push(ipv4);
      }
    });

    console.log(`${INFO_COLOR}[INFO] ${SUCCESS_COLOR}Devices found: ${devices.length}`);
    return devices;
  }
  catch (e) {
    console.log(`${ERROR_COLOR}[ERROR] ${SUCCESS_COLOR}${e.message}`);
    throw new Error(e);
  }
}

async function main() {
  try {
    const devices = getIPv4Devices();
    if (devices.length === 0) {
      console.log(`${ERROR_COLOR}[INFO] ${SUCCESS_COLOR}No Devices Connected.`);
      exit(0);
    }

    const { targetDevice } = await inquirer.prompt({
      type: "list",
      name: "targetDevice",
      message: `${INFO_COLOR}[INFO] ${SUCCESS_COLOR}Target Device~#`,
      choices: devices,
      prefix: ""
    });

    await adbConnect(port, pairPort, pairCode, targetDevice);
    if (antiturnoff === "1"){
      antiTurnOff();
    }
  }
  catch (e) {
    console.log(`${ERROR_COLOR}[ERROR] ${SUCCESS_COLOR}${e.message}`);
    exit(1);
  }
}

main();

