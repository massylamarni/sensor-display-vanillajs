const CHARTS_INFO = {
    'chart-1': {'endpointName': '/api/get/gas', 'endpointType': 'GET', 'chartType': 0},
    'chart-2': {'endpointName': '/api/ws/rfid', 'endpointType': 'WS', 'chartType': 0},
    'chart-3': {'endpointName': '/api/get/gas', 'endpointType': 'GET', 'chartType': 1},
}
const CHARTS_IDS = Object.keys(CHARTS_INFO);
const GET_ENDPOINTS = ['/api/get/gas', '/api/get/temperature', '/api/get/movement'];
const WS_ENDPOINTS = ['/api/ws/rfid'];

const SERVER_URL = "http://192.168.0.1:80";

/* Init Global variables */
let chartInsts = [];
let sensorData = [];
let ws;

/* Init functions */
const initClientWebSocket = () => {
    ws = new WebSocket(`ws://${SERVER_URL}/api/ws/rfid`);
                
    ws.onopen = function() {
        console.log("WebSocket connection established.");
    };

    ws.onerror = function(error) {
        console.error("WebSocket error:", error);
    };

    ws.onclose = function() {
        console.log("WebSocket connection closed.");
    };

    ws.onmessage = function(event) {
        for (let i = 0; i < WS_ENDPOINTS.length; i++) {
            storeData(WS_ENDPOINTS[i], JSON.parse(event.data));
        }
    }; 
}

const initCharts = () => {
    for (let i = 0; i < CHARTS_IDS.length; i++) {
        chartInsts[CHARTS_IDS[i]] = setChart(CHARTS_IDS[i]);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    initClientWebSocket();
    initCharts();

    setInterval(updateAll, 3000); 
});

const debugHere = (debug_tag, debug_data_collection) => {
    const DEBUG_SMALL_WALL = '----';
    const DEBUG_HALF_WALL = '--------------------------------------------------';
    const ToggleDebug = true;
    if (ToggleDebug) {
        console.log(DEBUG_HALF_WALL + 'START ' + debug_tag + DEBUG_HALF_WALL);
        debug_data_collection.forEach(debug_data => {
            if (debug_data.type == 0) {
                console.log(`${DEBUG_SMALL_WALL} ${debug_data.title} = ${debug_data.value} ${DEBUG_SMALL_WALL}`);
            }
            else if (debug_data.type == 1) {
                console.log(DEBUG_SMALL_WALL + 'START ' + debug_data.title + DEBUG_SMALL_WALL);
                console.log(debug_data.value);
                console.log(DEBUG_SMALL_WALL + 'END ' + debug_data.title + DEBUG_SMALL_WALL);
            }
        });
        console.log(DEBUG_HALF_WALL + 'END ' + debug_tag + DEBUG_HALF_WALL);
    } 
}

const checkStruct = (rawData) => {
    return (rawData && rawData[0]);
}

const filterNull = (rawData) => {
    if (checkStruct(rawData)) return [];
    const filteredDataArray = rawData.filter(data => (data.data != null));
    return filteredDataArray;
}

//Specific structure to the rawData state object
const getStateObjectData = (data) => {
    if (typeof data !== 'object') return false;
    const keys = Object.keys(data);
    let type;
    (data[keys[0]] !== '1' && data[keys[0]] !== '0') ? type = 0 : type = 1;
    return {'data': data[keys[0]], 'state': type === 0 ? (data[keys[1]] !== '0') : (data[keys[0]] !== '0'), 'type': type}
}

//Output: {"start": {dateObj}, "end": {dateObj}}
//Dependency to CHARTS_IDS
const getInitialChartTimeRange = (chartId) => {
    if (chartId == CHARTS_IDS[0] || chartId == CHARTS_IDS[2]) {
        return {"start": new Date(new Date().getTime() - 1 * 60 * 1000), "end": new Date(new Date().getTime() - 5 * 1000)}
    }
    if (chartId == CHARTS_IDS[1]) {
        return {"start": new Date(new Date().getTime() - 1 * 60 * 60 * 1000), "end": new Date(new Date().getTime() - 5 * 1000)}
    }
}

//Output: {"missingDataBefore": [chartData], "sensorData": [chartData], "missingDataAfter": [chartData]}
//Dependency to sensorData and CHARTS_IDS and CHARTS_INFO
const getInitialChartData = (chartId) => {
    const chartInfo = CHARTS_INFO[chartId];
    if (!checkStruct(sensorData)) {
        const missingData = getMissingData([], getInitialChartTimeRange(chartId));

        return {
            "missingDataBefore": getChartData(missingData.before),
            "sensorData": [],
            "missingDataAfter": getChartData(missingData.after)};
    }
    if (chartId == CHARTS_IDS[0] || chartId == CHARTS_IDS[2]) {
        const missingData = getMissingData(sensorData[chartInfo.endpointName], getInitialChartTimeRange(chartId));

        return {
            "missingDataBefore": getChartData(missingData.before),
            "sensorData": getChartData(sensorData[chartInfo.endpointName]),
            "missingDataAfter": getChartData(missingData.after)};
    }
    if (chartId == CHARTS_IDS[1]) {
        const missingData = getMissingData(sensorData[chartInfo.endpointName], getInitialChartTimeRange(chartId));

        return {
            "missingDataBefore": getChartData(missingData.before),
            "sensorData": getAverageChartData(getChartData(sensorData[chartInfo.endpointName]), getInitialChartTimeRange(chartId)),
            "missingDataAfter": getChartData(missingData.after)};
    }
}

//Input: [{"data": "value", "createdAt": "timeString"}],
//Output: {"min": value, "max": value}
function getPeakSensorValue(dataArray) {
    if (!checkStruct(dataArray)) return {"min": "Unknown", "max": "Unknown"};
    let max = dataArray[0].data, min = dataArray[0].data;
    for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i].data < min) {
            min = dataArray[i].data;
        }
        if (dataArray[i].data > max) {
            max = dataArray[i].data;
        }
    }
    return {"min": min, "max": max};
}

//Input [{"x": "timeString", "y": "value"}],
//Output: [{"x": "timeString", "y": "averagValue"}]
function getAverageChartData(chartData, chartTimeRange) {
    const minArrayLength = 15, minTimeSpan = 1000000, relativeChunkSize = 5;
    const timeSpan = (new Date(chartTimeRange.end) - new Date(chartTimeRange.start)) / 100000;
    const chunkSize = (dataArray.length > minArrayLength && timeSpan > minTimeSpan) ? Math.floor(timeNonce/relativeChunkSize) : 0;

    let averageChartData = [];
    let chunkSum = 0;
    for (let i = 0; i < chartData.length; i++) {
        chunkSum = chunkSum + chartData[i].y;
        if (i%chunkSize === 0) {
            averageChartData.push({"x": chartData[i].x, "y": chunkSum/chunkSize});
            chunkSum = 0;
        }
    }
    if (chunkSum != 0) averageChartData.push({"x": chartData.at(-1).x, "y": chunkSum/chunkSize});
    return averageChartData;
}

//Input: '/endpointName',
//Output_: [{"data": "value"}] or [{"data": {Object}}]
async function fetchRawData(endpointName) {
    try {
        const response = await fetch(SERVER_URL + endpointName, {
            method: 'GET',
        });
        const rawData = await response.json();

        storeData(endpointName, rawData);
    } catch (error) {
        console.error('Error fetching rawData: ', error);
    }
}

//Input: [{"data": "value"}] or [{"data": {Object}}],
//Output_: [{"data": "value", "createdAt": "timeString"}] or [{"data": {Object}, "createdAt": "timeString"}]
//Dependency to sensorData
function storeData(endpointName, rawData) {
    if (checkStruct(rawData)) return;
    const data = {...rawData, 'createdAt': new Date()};
    const localStorageData = JSON.parse(localStorage.getItem(endpointName)) || [];
    localStorageData.push(data);
    localStorage.setItem(endpointName, JSON.stringify(localStorageData));
    sensorData[endpointName] = localStorageData;
}

//Input: [{"data": "value", "createdAt": "timeString"}] or [{"data": {Object}, "createdAt": "timeString"}]
//Output: [{"y": value, "x": {timeObj}}]
function getChartData(dataArray) {
    const chartData = dataArray.map(data => {
        const stateObjectData = getStateObjectData(data.data);
        if (stateObjectData) {
            return {"x": new Date(data.createdAt), "y": stateObjectData.state ? 1 : 0};
        } else {
            return {"x": new Date(data.createdAt), "y": parseFloat(data.data)};
        }
    });
    return chartData;
}

//Input: [{"data": "value", "createdAt": "timeString"}] or [{"data": {Object}, "createdAt": "timeString"}]
//Output: {"before": [dataArray], "after": [dataArray]}
function getMissingData(dataArray, chartTimeRange) {
    const delay = 5000, predictedValue = "0";
    const defaultMissingData = [
        {"data": predictedValue, "createdAt": new Date(chartTimeRange.start).toString()},
        {"data": predictedValue, "createdAt": new Date(chartTimeRange.end).toString()} 
    ];

    let missingData = {"before": [], "after": []};
    if (!checkStruct(dataArray)) {
        missingData.after = defaultMissingData;
        return missingData;
    }
    const dataTimeRange = {"start": new Date(dataArray[0].createdAt), "end": new Date(dataArray.at(-1).createdAt)};

    /*
    [ds, de]
    [cs, ce  ]
    */
    if (dataTimeRange.start <= chartTimeRange.start && dataTimeRange.end < chartTimeRange.end) {
        missingData.after = [
            {"data": dataArray.at(-1).data, "createdAt": new Date(dataTimeRange.end).toString()},
            {"data": predictedValue, "createdAt": new Date(dataTimeRange.end.getTime()+delay).toString()},
            {"data": predictedValue, "createdAt": new Date(chartTimeRange.end).toString()}
        ];
    }
    /*
      [ds, de]
    [  cs, ce]
    */
    else if (dataTimeRange.start > chartTimeRange.start && dataTimeRange.end >= chartTimeRange.end) {
        missingData.before = [
            {"data": predictedValue, "createdAt": new Date(chartTimeRange.start).toString()},
            {"data": predictedValue, "createdAt": new Date(dataTimeRange.start.getTime()-delay).toString()},
            {"data": dataArray[0].data, "createdAt": new Date(dataTimeRange.start).toString()},
        ];
    }
    /*
      [ds, de]
    [  cs, ce  ]
    */
    else if (dataTimeRange.start > chartTimeRange.start && dataTimeRange.end < chartTimeRange.end) {
        missingData.before = [
            {"data": predictedValue, "createdAt": new Date(chartTimeRange.start).toString()},
            {"data": predictedValue, "createdAt": new Date(dataTimeRange.start.getTime()-delay).toString()},
            {"data": dataArray[0].data, "createdAt": new Date(dataTimeRange.start).toString()},
        ];
        missingData.after = [
            {"data": dataArray.at(-1).data, "createdAt": new Date(dataTimeRange.end).toString()},
            {"data": predictedValue, "createdAt": new Date(dataTimeRange.end.getTime()+delay).toString()},
            {"data": predictedValue, "createdAt": new Date(chartTimeRange.end).toString()}
        ]
    } else {
        missingData.after = defaultMissingData;
    }

    return missingData;
}

function setChart(chartId) {
    const ctx = document.getElementById(chartId).getContext('2d');
    const chartInfo = CHARTS_INFO[chartId];
    const initialChartData = getInitialChartData(chartId);
    const chartTimeRange = getInitialChartTimeRange(chartId);
    let options, data;

    if (chartInfo.chartType == 0) {
        options = {
            layout: {
                padding: {
                    top: 15,
                }
            },
            plugins: {
                legend: { display: false },
            },
            animation: {
                duration: 0,
            },
            responsive: true,
            scales: {
                x: {
                    type: 'time',
                    display: false,
                    grid: {
                        display: false
                    },
                    ticks: {
                        display: false
                    },
                    min: chartTimeRange.start,
                    max: chartTimeRange.end
                },
                y: {
                    display: false,
                    grid: {
                        display: false
                    },
                    ticks: {
                        display: false
                    },
                    min: 0,
                }
            }
        }
        data = {
            datasets: [
                { 
                    data: initialChartData.missingDataBefore,
                    fill: false,
                    tension: 0.5,
                    pointRadius: 0,
                    borderColor: function(context) {
                        const gradient = ctx.createLinearGradient(0, 0, context.chart.width, 0);
                        gradient.addColorStop(0, 'rgba(31, 31, 31, 0)');
                        gradient.addColorStop(0.5, 'rgb(228, 48, 48)');
                        gradient.addColorStop(1, 'rgba(31, 31, 31, 0)');
                        return gradient;
                    },
                },
                { 
                    data: initialChartData.sensorData,
                    fill: false,
                    tension: 0.5,
                    pointRadius: 0,
                    borderColor: function(context) {
                        const gradient = ctx.createLinearGradient(0, 0, context.chart.width, 0);
                        gradient.addColorStop(0, 'rgba(31, 31, 31, 0)');
                        gradient.addColorStop(0.5, 'rgba(48, 228, 142, 1)');
                        gradient.addColorStop(1, 'rgba(31, 31, 31, 0)');
                        return gradient;
                    },
                },
                { 
                    data: initialChartData.missingDataAfter,
                    fill: false,
                    tension: 0.5,
                    pointRadius: 0,
                    borderColor: function(context) {
                        const gradient = ctx.createLinearGradient(0, 0, context.chart.width, 0);
                        gradient.addColorStop(0, 'rgba(31, 31, 31, 0)');
                        gradient.addColorStop(0.5, 'rgb(228, 48, 48)');
                        gradient.addColorStop(1, 'rgba(31, 31, 31, 0)');
                        return gradient;
                    },
                },
            ]
        };
    }
    else if (chartInfo.chartType == 1) {
        options = {
            layout: {
                padding: {
                    top: 15,
                }
            },
            plugins: {
                legend: { display: false },
            },
            animation: {
                duration: 0,
            },
            responsive: true,
            scales: {
                x: {
                type: 'time',
                    display: true,
                grid: {
                    display: false
                },
                ticks: {
                    display: true,
                    stepSize: 5
                },
                min: chartTimeRange.start,
                max: chartTimeRange.end
                },
                y: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        display: true
                    },
                    min: 0,
                }
            }
        };
        data = {
            datasets: [
            { 
                data: initialChartData.missingDataBefore,
                fill: true,
                tension: 0.5,
                pointRadius: 0,
                borderColor: "rgb(228, 48, 48)",
                backgroundColor: function(context) {
                const gradient = ctx.createLinearGradient(0, 0, 0, context.chart.height);
                gradient.addColorStop(0.5, 'rgba(48, 228, 142, 0.1)');
                gradient.addColorStop(1, 'rgba(31, 31, 31, 0)');
                return gradient;
                },
            },
            { 
                data: initialChartData.sensorData,
                fill: true,
                tension: 0.5,
                pointRadius: 0,
                borderColor: "rgba(48, 228, 142, 1)",
                backgroundColor: function(context) {
                const gradient = ctx.createLinearGradient(0, 0, 0, context.chart.height);
                gradient.addColorStop(0.5, 'rgba(48, 228, 142, 0.1)');
                gradient.addColorStop(1, 'rgba(31, 31, 31, 0)');
                return gradient;
                },
            },
            { 
                data: initialChartData.missingDataAfter,
                fill: true,
                tension: 0.5,
                pointRadius: 0,
                borderColor: "rgb(228, 48, 48)",
                backgroundColor: function(context) {
                const gradient = ctx.createLinearGradient(0, 0, 0, context.chart.height);
                gradient.addColorStop(0.5, 'rgba(48, 228, 142, 0.1)');
                gradient.addColorStop(1, 'rgba(31, 31, 31, 0)');
                return gradient;
                },
            },
            ]
        };
    }

    return new Chart(chartId, {
        type: "line",
        data: data,
        options: options
    });
}

//Dependecy to CHART_IDS, CHART_INFO and ChartInsts
async function updateAll() {
    //Fetch data from all GET endpoints
    for (let i = 0; i < CHARTS_IDS.length; i++) {
        const chartInfo = CHARTS_INFO[CHARTS_IDS[i]];
        if (chartInfo.endpointType == 'GET') await fetchRawData(chartInfo.endpointName);
    }
    
    //Update display components
    updateSensorDisplayEls();

    //Update charts
    for (let i = 0; i < CHARTS_IDS.length; i++) {
        const chartInfo = CHARTS_INFO[CHARTS_IDS[i]];
        const initialChartTimeRange = getInitialChartTimeRange(CHARTS_IDS[i]);
        const initialChartData = getInitialChartData(CHARTS_IDS[i]);
        chartInsts[CHARTS_IDS[i]].data.datasets[0].data = initialChartData.missingDataBefore;
        chartInsts[CHARTS_IDS[i]].data.datasets[1].data = initialChartData.sensorData;
        chartInsts[CHARTS_IDS[i]].data.datasets[2].data = initialChartData.missingDataAfter;
        chartInsts[CHARTS_IDS[i]].options.scales.x.min = initialChartTimeRange.start;
        chartInsts[CHARTS_IDS[i]].options.scales.x.max = initialChartTimeRange.end;
        chartInsts[CHARTS_IDS[i]].update();
    }
}

/* -------------------------------------------------------------------------------------------------------------------- */

//Dependecy to sensorData and CHARTS_INFO
function updateSensorDisplayEls() {
    if (!checkStruct(sensorData)) return;
    const sensorDisplayEls = document.getElementsByClassName("sensor-display");
    const sensorStateDisplayEls = document.getElementsByClassName("sensor-state-display");

    Array.from(sensorDisplayEls).forEach((sensorDisplayEl, i) => {
        const endpointName = sensorDisplayEl.getAttribute("data-endpointName");
        const missingDataValue = getMissingData(sensorData[endpointName], getInitialChartTimeRange(CHARTS_IDS[i].chartType));
        const sensorDisplayValue =  checkStruct(missingDataValue) ? missingDataValue.at(-1).data : sensorData[endpointName].at(-1).data;
        const sensorDisplayValuePeaks = getPeakSensorValue(sensorData[endpointName]);

        const sensorDisplayValueEl = sensorDisplayEl.getElementsByClassName('__sensor-display-value')[0];
        const sensorDisplayMinValueEl = sensorDisplayEl.getElementsByClassName('__sensor-display-min-value')[0];
        const sensorDisplayMaxValueEl = sensorDisplayEl.getElementsByClassName('__sensor-display-max-value')[0];
        sensorDisplayValueEl.textContent = sensorDisplayValue;
        sensorDisplayMinValueEl.textContent = sensorDisplayValuePeaks.min;
        sensorDisplayMaxValueEl.textContent = sensorDisplayValuePeaks.max;
    });
    Array.from(sensorStateDisplayEls).forEach((sensorStateDisplayEl, i) => {
        const endpointName = sensorStateDisplayEl.getAttribute("data-endpointName");
        const stateObjectData = getStateObjectData(sensorData[endpointName].at(-1).data);
        const missingDataValue = getMissingData(sensorData[endpointName], getInitialChartTimeRange(CHARTS_IDS[i].chartType));
        const sensorStateState =  checkStruct(missingDataValue) ? "Unknown" : (stateObjectData.state ? "True" : "False");
        const sensorStateStateValue = checkStruct(missingDataValue) ? false : stateObjectData.state;
        const sensorStateData = stateObjectData.type == 0 ? stateObjectData.data : (stateObjectData.state ? "True" : "False");

        const sensorStateStateEl = sensorStateDisplayEl.getElementsByClassName('__sensor-state-value')[0];
        const sensorStateDataEl = sensorStateDisplayEl.getElementsByClassName('__sensor-state-last-state')[0];
        const sensorStateTrueEls = sensorStateDisplayEl.getElementsByClassName('__sensor-state-true');
        const sensorStateFalseEls = sensorStateDisplayEl.getElementsByClassName('__sensor-state-false');
        sensorStateStateEl.textContent = sensorStateState;
        sensorStateDataEl.textContent = sensorStateData;
        Array.from(sensorStateTrueEls).forEach(sensorStateTrueEl => {
            sensorStateStateValue ? sensorStateTrueEl.classList.remove('hidden') : sensorStateTrueEl.classList.add('hidden');
        })
        Array.from(sensorStateFalseEls).forEach(sensorStateFalseEl => {
            sensorStateStateValue ? sensorStateFalseEl.classList.add('hidden') : sensorStateFalseEl.classList.remove('hidden');
        })
    });
}

function toggleSensorChart(event) {
    const sensorChartId = event.target.getAttribute('data-target-id');
    const sensorCharts = document.getElementsByClassName('__sensor-chart');
    const targetSensorChart = document.getElementById(sensorChartId);
    Array.from(sensorCharts).forEach(sensorChart => {
        sensorChart.classList.add('hidden');
    });
    targetSensorChart.classList.remove('hidden');
}