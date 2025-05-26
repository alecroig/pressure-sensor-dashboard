// Main Code to run all the html call back functions 

let bleDevice, bleServer, pressureCharacteristic;
let isConnected = false;
let isStreaming = false;

let logArea = document.getElementById('log');
let connectButton = document.getElementById('connectButton');
let startButton = document.getElementById('startButton');
let stopButton = document.getElementById('stopButton');
let saveButton = document.getElementById('saveButton');
let resetButton = document.getElementById('resetButton');
let testNameInput = document.getElementById('testName');
let eventInput = document.getElementById('eventInput');
let eventButton = document.getElementById('eventButton');

let pressureChart;
let startTime = null;
let latestElapsed = null;
let latestPressure = null;
let receivedData = [];
let eventMarkers = [];

const SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CHARACTERISTIC_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

// Connect to BLE
connectButton.addEventListener('click', async () => {
    try {
    bleDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
    });

    bleServer = await bleDevice.gatt.connect();
    const service = await bleServer.getPrimaryService(SERVICE_UUID);
    pressureCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    connectButton.classList.add('connected');
    isConnected = true;
    startButton.disabled = false;

    logMessage("✅ Connected to device GATT server.\nREADY TO START\nPlease press ▶️ Start button above.");

    } 
    catch (error) {
        console.error("❌ BLE Connection Failed:", error);
        alert("Connection failed. Make sure the device is on and nearby.");
    }
});

// Start streaming
startButton.addEventListener('click', async () => {
    if (!pressureCharacteristic) return;

    try {
        await pressureCharacteristic.startNotifications();
        pressureCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);

        startTime = new Date();
        receivedData = [];
        eventMarkers = [];

        startButton.classList.add('started');
        stopButton.classList.remove('stopped');
        stopButton.disabled = false;
        saveButton.disabled = false;
        isStreaming = true;

        logMessage("▶️ Started data stream");

    } 
    catch (err) {
        console.error("❌ Start error:", err);
    }
});

// Stop streaming
stopButton.addEventListener('click', async () => {
    try {
        await pressureCharacteristic.stopNotifications();
        pressureCharacteristic.removeEventListener('characteristicvaluechanged', handleNotifications);

        stopButton.classList.add('stopped');
        startButton.classList.remove('started');
        isStreaming = false;
        resetButton.disabled = false;
        resetButton.classList.add('reset-ready');

        logMessage("⏹️ Stopped data stream");
    } 
    catch (err) {
        console.error("❌ Stop error:", err);
    }
});

// Save CSV
saveButton.addEventListener('click', () => {
    const fileName = testNameInput.value.trim() || 'pressure_data';
    const csvRows = ["Timestamp,Elapsed Time (s),Pressure (psi),Event"];

    receivedData.forEach(row => csvRows.push(row.join(',')));

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = '${fileName}.csv';
    a.click();
    URL.revokeObjectURL(url);
});

// Event logging
eventButton.addEventListener('click', () => {
    if (!isStreaming || latestElapsed === null || latestPressure === null) return;

    const name = eventInput.value.trim();
    if (!name) return;

    const now = new Date();
    const timestamp = now.toLocaleString();

    // log with emoji
    const logLine = `${timestamp.padEnd(22)} ${elapsed.padStart(8)} sec ${pressure.toFixed(4).padStart(10)} psi`;
    logMessage(logLine);

    // Mark in data and chart
    receivedData.push([timestamp, latestElapsed.toFixed(3), latestPressure.toFixed(4), name]);

    // Add vertical line annotation
    requestAnimationFrame(() => {
        const id = `event-${Date.now()}`;
        pressureChart.options.plugins.annotation.annotations[id] = {
            type: 'line',
            scaleID: 'x',
            value: latestElapsed,
            borderColor: 'red',
            borderWidth: 2,
            label: {
            content: name,
            enabled: true,
            position: "start",
            backgroundColor: 'rgba(255,0,0,0.8)',
            color: 'white',
            font: { weight: 'bold' }
             }
        };
        pressureChart.update();
    });

    eventInput.value = ""
});

// Handle incoming BLE notifications
function handleNotifications(event) {
    const value = event.target.value;
    const decoded = new TextDecoder().decode(value);
    const [elapsedStr, pressureStr] = decoded.trim().split(',');
    const pressure = parseFloat(pressureStr);
    const now = new Date();
    const elapsed = ((now - startTime) / 1000).toFixed(3);
    const timestamp = now.toLocaleString();

    latestElapsed = parseFloat(elapsed);
    latestPressure = pressure;

    const logLine = `${timestamp.padEnd(22)} ${elapsed.padStart(8)} sec ${pressure.toFixed(4).padStart(10)} psi`;
    logMessage(logLine);

    receivedData.push([timestamp, elapsed, pressure.toFixed(4), ""]);

    pressureChart.data.datasets[0].data.push({
        x: parseFloat(elapsed),
        y: pressure
    });
    pressureChart.update();
}

// Log helper
function logMessage(msg) {
    logArea.value += msg + '\n';
    logArea.scrollTop = logArea.scrollHeight;
}

// Chart.js setup
window.onload = () => {
    const ctx = document.getElementById('pressureChart').getContext('2d');
    pressureChart = new Chart(ctx, {
    type: 'line',
    data: {
        datasets: [
            {
            label: 'Pressure (psi)',
            data: [],
            borderColor: '#3e95cd',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.3,
            pointRadius: 2,
            }
        ]
    },
    options: {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            annotation: {
                annotations: {}
            }
        },
        scales: {
        x: {
            type: 'linear',
            title: { display: true, text: 'Elapsed Time (s)' }
        },
        y: {
            title: { display: true, text: 'Pressure (psi)' }
        }
        }

    },
        plugins: [Chart.registry.getPlugin('annotation')]
        });
};

// Reset dashboard
resetButton.addEventListener('click', () => {
    pressureChart.data.datasets[0].data = [];
    pressureChart.update();

    logArea.value = '';
    testNameInput.value = '';
    resetButton.disabled = true;
    resetButton.classList.remove('reset-ready');
    startButton.classList.remove('started');
    stopButton.classList.remove('stopped');

    console.log("🔄 Dashboard has been reset.");
});
