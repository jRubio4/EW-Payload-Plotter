// Global variables
let fileContent = '';
let chartRefs = {};
let currentProduct = 'waterrat'; // Default product

// Product selection handler
document.getElementById("productSelect").addEventListener("change", function(e) {
    currentProduct = e.target.value;
    // Clear any existing data
    document.getElementById("hexInput").value = "";
    document.getElementById("outputTable").innerHTML = "";
    document.getElementById("status").textContent = "";
    // Reset file input
    document.getElementById("logFileInput").value = "";
    fileContent = '';
    // Destroy existing charts
    Object.values(chartRefs).forEach(chart => {
        if (chart instanceof Chart) {
            chart.destroy();
        }
    });
    chartRefs = {};
});

// Product-specific parsing configurations
const PRODUCT_CONFIGS = {
    waterrat: {
        minLength: 31,
        parseFunction: parseWaterRatFrame
    },
    analog: {
        minLength: 35,
        parseFunction: parseAnalogFrame
    },
    sdi12: {
        minLength: 23,
        parseFunction: parseSDI12Frame
    },
    peoplecounter: {
        minLength: 26,
        parseFunction: parsePeopleCounterFrame
    }
};

// Helper function to parse alarm flags
function parseAlarmFlags(byte, isWaterRat) {
    const bits = byte.toString(2).padStart(8, '0');
    if (isWaterRat) {
        return {
            'Tilt Event': bits[7] === '1',
            'Dropped': bits[6] === '1',
            'Stuck': bits[5] === '1',
            'Heart-beat Message': bits[4] === '1',
            'Retry Message': bits[3] === '1',
            'Commission Message': bits[2] === '1'
        };
    } else {
        return {
            'Threshold Event': bits[7] === '1' || bits[6] === '1',
            'Voltage Drop Event': bits[5] === '1',
            'Heart-beat Message': bits[4] === '1',
            'Commission Message': bits[3] === '1',
            'Analog Read Error': bits[2] === '1',
            'Retry Message': bits[1] === '1',
            'Rebooted Event': bits[0] === '1'
        };
    }
}

// Product-specific parsing functions
function parseWaterRatFrame(bytes) {
    const gpsNibbles = bytes[13];
    const numSatellites = (gpsNibbles >> 4) & 0x0F;
    const gpsState = gpsNibbles & 0x0F;
    
    const alarmFlags = parseAlarmFlags(bytes[15], true);
    const alarmFlagsStr = Object.entries(alarmFlags)
        .filter(([_, value]) => value)
        .map(([key, _]) => key)
        .join(', ');

    const lat = (bytes[21] << 24 | bytes[22] << 16 | bytes[23] << 8 | bytes[24]) / 10000;
    const lon = (bytes[25] << 24 | bytes[26] << 16 | bytes[27] << 8 | bytes[28]) / 10000;

    return {
        "Device IMEI": bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(""),
        "Frame Count": bytes[8],
        "FW Identifier": bytes.slice(9, 13).map(b => b.toString(16)).join(""),
        "GPS Satellites": numSatellites,
        "GPS State": gpsState,
        "Payload Version": bytes[14],
        "Alarm Flags": alarmFlagsStr || "None",
        "Tilt Angle": bytes[16] / 10,
        "Battery": (bytes[17] << 8 | bytes[18]) / 1000,
        "Temperature": (bytes[19] << 8 | bytes[20]) / 100,
        "GPS Latitude": lat,
        "GPS Longitude": lon,
        "RSRP": bytes[29],
        "RSRQ": bytes[30]
    };
}

function parseAnalogFrame(bytes) {
    const alarmFlags = parseAlarmFlags(bytes[15], false);
    const alarmFlagsStr = Object.entries(alarmFlags)
        .filter(([_, value]) => value)
        .map(([key, _]) => key)
        .join(', ');

    const deviceType = document.getElementById("analogDeviceType")?.value || "WLM";
    const analogValue = bytes[31] << 8 | bytes[32];
    const pulseCount = bytes[33] << 8 | bytes[34];

    // Process values based on device type
    let processedAnalogValue;
    let analogValueLabel = "Analog Value";
    let pulseCountLabel = "Pulse Count";
    let usePulseCount = false;
    let useAnalogValue = false;

    if (deviceType === "EFS") {
        processedAnalogValue = analogValue; // This value is in volts
        analogValueLabel = "Fence Voltage";
        useAnalogValue = true;
    } else if (deviceType === "WLM") {
        processedAnalogValue = analogValue; // This value is in millivolts
        analogValueLabel = "Water Level";
        useAnalogValue = true;
    } else if (deviceType === "RG") {
        processedAnalogValue = analogValue; // Keep as millivolts
        analogValueLabel = "Rain Gauge Value";
        pulseCountLabel = "Rain Count";
        usePulseCount = true;
    }

    return {
        "Device IMEI": bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(""),
        "Frame Count": bytes[8],
        "FW Identifier": bytes.slice(9, 13).map(b => b.toString(16)).join(""),
        "Payload Version": bytes[14],
        "Alarm Flags": alarmFlagsStr || "None",
        "Digital Pin Event": "Not used",
        "Battery": (bytes[17] << 8 | bytes[18]) / 1000,
        "Temperature": (bytes[19] << 8 | bytes[20]) / 100,
        "GPS Lat": "Not used",
        "GPS Lon": "Not used",
        "RSRP": bytes[29],
        "RSRQ": bytes[30],
        [analogValueLabel]: useAnalogValue ? processedAnalogValue : "Not used",
        [pulseCountLabel]: usePulseCount ? pulseCount : "Not used"
    };
}

function parseSDI12Frame(bytes) {
    let result = {
        "Device IMEI": bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(""),
        "Frame Count": bytes[8],
        "FW Identifier": bytes.slice(9, 13).map(b => b.toString(16)).join(""),
        "Payload Version": bytes[14],
        "Battery": (bytes[16] << 8 | bytes[17]) / 1000,
        "Temperature": bytes[18] << 8 | bytes[19],
        "RSRP": bytes[20],
        "RSRQ": bytes[21],
        "Number of Measurements": bytes[22]
    };

    // Parse SDI-12 measurements if present
    let currentByte = 23;
    let measurementNum = 1;
    while (currentByte < bytes.length && measurementNum <= result["Number of Measurements"]) {
        const header = bytes[currentByte++];
        const numDataPoints = header & 0x0F;
        
        for (let i = 0; i < numDataPoints && currentByte + 3 < bytes.length; i++) {
            const value = new Float32Array(new Uint8Array([
                bytes[currentByte],
                bytes[currentByte + 1],
                bytes[currentByte + 2],
                bytes[currentByte + 3]
            ]).buffer)[0];
            
            result[`Measurement ${measurementNum} Data ${i + 1}`] = value;
            currentByte += 4;
        }
        measurementNum++;
    }

    return result;
}

function parsePeopleCounterFrame(bytes) {
    return {
        "Device IMEI": bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(""),
        "Frame Count": bytes[8],
        "FW Identifier": bytes.slice(9, 13).map(b => b.toString(16)).join(""),
        "Payload Version": bytes[14],
        "Battery": (bytes[16] << 8 | bytes[17]) / 1000,
        "Temperature": (bytes[18] << 8 | bytes[19]) / 100,
        "RSRP": bytes[20],
        "RSRQ": bytes[21],
        "Counter 1": bytes[22] << 8 | bytes[23],
        "Counter 2": bytes[24] << 8 | bytes[25]
    };
}

// Shared parsing function
function parseHexString(hex) {
    const bytes = hex.match(/.{1,2}/g).map(b => parseInt(b, 16));
    const config = PRODUCT_CONFIGS[currentProduct];
    
    if (!bytes || bytes.length < config.minLength) return null;
    return config.parseFunction(bytes);
}

// Decoder functionality
document.getElementById("decodeButton").addEventListener("click", function () {
    const hexString = document.getElementById("hexInput").value.replace(/\s+/g, "");
    const outputTable = document.getElementById("outputTable");
    const config = PRODUCT_CONFIGS[currentProduct];
    
    if (hexString.length < config.minLength * 2) {
        outputTable.innerHTML = "<tr><td colspan='2'>Error: Input too short</td></tr>";
        return;
    }

    const parsed = parseHexString(hexString);
    if (!parsed) {
        outputTable.innerHTML = "<tr><td colspan='2'>Error: Failed to parse hex string</td></tr>";
        return;
    }

    const tableContent = Object.entries(parsed).map(([key, value]) => {
        let displayValue = value;
        if (key === "Battery") displayValue += " V";
        if (key === "Temperature") displayValue += " °C";
        if (key === "Tilt Angle") displayValue += "°";
        if (key === "GPS Latitude" || key === "GPS Lat") displayValue += "°";
        if (key === "GPS Longitude" || key === "GPS Lon") displayValue += "°";
        if (key === "RSRP" || key === "RSRQ") {
            displayValue = "-" + value + " dBm";
        }
        if ((key === "Fence Voltage" || key === "Water Level" || key === "Rain Gauge Value" || key === "Rain Count") && value !== "Not used") {
            if (key === "Fence Voltage") {
                displayValue += " V";
            } else if (key === "Water Level" || key === "Rain Gauge Value") {
                displayValue += " mV";
            } else if (key === "Rain Count") {
                displayValue += " mm";
            }
        }
        if (key === "Digital Pin Event" && value !== "Not used") {
            displayValue = "0x" + value.toString(16).padStart(2, '0');
        }
        return `<tr><td>${key}</td><td>${displayValue}</td></tr>`;
    }).join("");
    
    outputTable.innerHTML = tableContent;
});

// File input handler
document.getElementById("logFileInput").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        fileContent = event.target.result;
        document.getElementById("status").textContent = "File loaded. Click 'Parse and Plot'.";
    };
    reader.readAsText(file);
});

// Plot button handler
document.getElementById("parseButton").addEventListener("click", function () {
    if (!fileContent) {
        document.getElementById("status").textContent = "Please upload a log file first.";
        return;
    }

    const lines = fileContent.split("\n");
    const dataPoints = {
        frameCount: [],
        battery: [],
        temperature: []
    };

    // Add product specific data points
    if (currentProduct === 'waterrat') {
        dataPoints.tiltAngle = [];
        dataPoints.gpsLat = [];
        dataPoints.gpsLon = [];
    } else if (currentProduct === 'analog') {
        dataPoints.analogValue = [];
        dataPoints.pulseCount = [];
    } else if (currentProduct === 'peoplecounter') {
        dataPoints.counter1 = [];
        dataPoints.counter2 = [];
    }

    for (const line of lines) {
        const match = line.match(/\[(.*?)\].*?Byte string \(hex\):\s*([0-9a-fA-F]+)/);
        if (!match) continue;

        const [_, timestampStr, hex] = match;
        const parsed = parseHexString(hex);
        if (!parsed) continue;

        const ts = luxon.DateTime.fromFormat(timestampStr, "yyyy-MM-dd HH:mm:ss,SSS").toJSDate();
        dataPoints.frameCount.push({ x: ts, y: parsed["Frame Count"] });
        dataPoints.battery.push({ x: ts, y: parsed["Battery"] });
        dataPoints.temperature.push({ x: ts, y: parsed["Temperature"] });

        if (currentProduct === 'waterrat') {
            dataPoints.tiltAngle.push({ x: ts, y: parsed["Tilt Angle"] });
            if (parsed["GPS Latitude"] && parsed["GPS Longitude"]) {
                dataPoints.gpsLat.push({ x: ts, y: parsed["GPS Latitude"] });
                dataPoints.gpsLon.push({ x: ts, y: parsed["GPS Longitude"] });
            }
        } else if (currentProduct === 'analog') {
            dataPoints.analogValue.push({ x: ts, y: parsed["Analog Value"] });
            dataPoints.pulseCount.push({ x: ts, y: parsed["Pulse Count"] });
        } else if (currentProduct === 'peoplecounter') {
            dataPoints.counter1.push({ x: ts, y: parsed["Counter 1"] });
            dataPoints.counter2.push({ x: ts, y: parsed["Counter 2"] });
        }
    }

    const count = dataPoints.frameCount.length;
    if (count === 0) {
        document.getElementById("status").textContent = "No valid data entries found.";
        return;
    }

    document.getElementById("status").textContent = `Parsed ${count} entries.`;

    let chartConfigs = [
        { id: "frameCountChart", label: "Frame Count", data: dataPoints.frameCount, color: "blue" },
        { id: "batteryChart", label: "Battery Voltage (V)", data: dataPoints.battery, color: "green" },
        { id: "temperatureChart", label: "Temperature (°C)", data: dataPoints.temperature, color: "red" }
    ];

    // Add product specific charts
    if (currentProduct === 'waterrat') {
        chartConfigs = chartConfigs.concat([
            { id: "tiltAngleChart", label: "Tilt Angle (°)", data: dataPoints.tiltAngle, color: "purple" },
            { id: "gpsLatChart", label: "GPS Latitude (°)", data: dataPoints.gpsLat, color: "orange" },
            { id: "gpsLonChart", label: "GPS Longitude (°)", data: dataPoints.gpsLon, color: "brown" }
        ]);
    } else if (currentProduct === 'analog') {
        chartConfigs = chartConfigs.concat([
            { id: "analogChart", label: "Analog Value (mV)", data: dataPoints.analogValue, color: "orange" },
            { id: "pulseCountChart", label: "Pulse Count", data: dataPoints.pulseCount, color: "purple" }
        ]);
    } else if (currentProduct === 'peoplecounter') {
        chartConfigs = chartConfigs.concat([
            { id: "counter1Chart", label: "Counter 1", data: dataPoints.counter1, color: "orange" },
            { id: "counter2Chart", label: "Counter 2", data: dataPoints.counter2, color: "purple" }
        ]);
    }

    chartConfigs.forEach(cfg => {
        const ctx = document.getElementById(cfg.id).getContext("2d");

        let yScaleOptions = {
            title: { display: true, text: cfg.label }
        };

        if (cfg.label.includes("Battery")) {
            yScaleOptions.suggestedMin = 0;
            yScaleOptions.suggestedMax = 4.0;
        } else if (cfg.label.includes("Temperature")) {
            yScaleOptions.suggestedMin = 0;
            yScaleOptions.suggestedMax = 30;
        } else if (cfg.label.includes("Frame Count")) {
            yScaleOptions.min = 0;
            yScaleOptions.max = 255;
        } else if (cfg.label.includes("Tilt Angle")) {
            yScaleOptions.suggestedMin = 0;
            yScaleOptions.suggestedMax = 90;
        } else if (cfg.label.includes("GPS")) {
            // Auto-scale for GPS coordinates
        } else if (cfg.label.includes("Analog Value")) {
            yScaleOptions.suggestedMin = 0;
            yScaleOptions.suggestedMax = 4096;
        } else if (cfg.label.includes("Pulse Count")) {
            yScaleOptions.min = 0;
        } else if (cfg.label.includes("Counter")) {
            yScaleOptions.min = 0;
        }

        if (chartRefs[cfg.id] instanceof Chart) {
            chartRefs[cfg.id].destroy();
        }

        chartRefs[cfg.id] = new Chart(ctx, {
            type: "line",
            data: {
                datasets: [{
                    label: cfg.label,
                    data: cfg.data,
                    borderColor: cfg.color,
                    backgroundColor: cfg.color,
                    fill: false,
                    tension: 0.2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: "time",
                        time: {
                            tooltipFormat: 'yyyy-MM-dd HH:mm:ss',
                            unit: 'day'
                        },
                        title: {
                            display: true,
                            text: "Timestamp"
                        }
                    },
                    y: yScaleOptions
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            }
        });
    });
}); 