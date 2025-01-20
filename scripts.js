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

document.addEventListener('DOMContentLoaded', function () {
    updateAll(true);
    setInterval(updateAll, 3000);

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
        try {
            storeData('/api/ws/rfid', JSON.parse(event.data));
        } catch (e) {
            console.error("Error parsing received data:", e);
        }
    };    
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

const checkStruct = (data) => {
    return (data && data[0]);
}

const filterNull = (data) => {
    if (checkStruct(data)) {
        const filteredData = data.filter(entry => (entry.data != null));
        return filteredData;
    }
    return false;
}

function missingDataSpectrum(data, displayTimeRange) {
    const debug_tag = 'missingDataSpectrum';
    let debug_switch = '-1';

    let missingData = [];
    const delay = 5000;
    const dummyValue = "0";
    const defaultMissingData = [
    {"data": dummyValue, "createdAt": new Date(displayTimeRange.start).toString()},
    {"data": dummyValue, "createdAt": new Date(displayTimeRange.end).toString()} 
    ];
    
    if (!checkStruct(data)) {
        missingData = defaultMissingData;
        debug_switch = 'defaultMissingData';
    } else {
    const dataTime = {"start": new Date(data[0].createdAt), "end": new Date(data[data.length-1].createdAt)};
    if (dataTime.start <= displayTimeRange.start && dataTime.end >= displayTimeRange.end) {
        //Normal behavior
        debug_switch = 'Normal behavior';
    }
    else if (dataTime.start <= displayTimeRange.start && dataTime.end < displayTimeRange.end) {
        missingData = [
        {"data": data[data.length-1].data, "createdAt": new Date(dataTime.end).toString()},
        {"data": dummyValue, "createdAt": new Date(dataTime.end.getTime()+delay).toString()},
        {"data": dummyValue, "createdAt": new Date(displayTimeRange.end).toString()}
        ];
        debug_switch = 'Addition at the end';
    }
    else if (dataTime.start > displayTimeRange.start && dataTime.end >= displayTimeRange.end) {
        missingData = [
        {"data": dummyValue, "createdAt": new Date(displayTimeRange.start).toString()},
        {"data": dummyValue, "createdAt": new Date(dataTime.start.getTime()-delay).toString()},
        {"data": data[0].data, "createdAt": new Date(dataTime.start).toString()},
        ];
        debug_switch = 'Addition at the beginning';
    }
    else if (dataTime.start > displayTimeRange.start && dataTime.end < displayTimeRange.end) {
        missingData = [
        /*
        {"data": dummyValue, "createdAt": new Date(displayTimeRange.start).toString()},
        {"data": dummyValue, "createdAt": new Date(dataTime.start.getTime()-delay).toString()},
        {"data": data[0].data, "createdAt": new Date(dataTime.start).toString()},
        */
        {"data": data[data.length-1].data, "createdAt": new Date(dataTime.end).toString()},
        {"data": dummyValue, "createdAt": new Date(dataTime.end.getTime()+delay).toString()},
        {"data": dummyValue, "createdAt": new Date(displayTimeRange.end).toString()}
        ];
        debug_switch = 'Addition in both sides';
    } else {
        missingData = defaultMissingData;
        debug_switch = 'defaultMissingData';
    }
    }
    const debug_data_collection = [
        {
            "title": 'debug_switch',
            "value": debug_switch,
            "type": 0
        },
        {
            "title": 'missingData',
            "value": missingData,
            "type": 1
        }
    ];
    debugHere(debug_tag, debug_data_collection);
    return missingData;
}

function getPeakSensorValue(sensorData) {
    let max = sensorData[sensorData.length-1].data, min = sensorData[sensorData.length-1].data;
    for (let i = 0; i < sensorData.length; i++) {
        if (sensorData[i].data < min) {
            min = sensorData[i].data;
        }
        if (sensorData[i].data > max) {
            max = sensorData[i].data;
        }
    }
    return {"min": min, "max": max};
}

function averageData(data, chunkSize) {
    let avgs = [];
    let chunkSum = 0;
    for (let i = 0; i < data.length; i++) {
        chunkSum = chunkSum + data[i].y;
        if (i%chunkSize === 0) {
            avgs.push({"x": data[i].x, "y": chunkSum/chunkSize});
            chunkSum = 0;
        }  
    }
    if (chunkSum != 0) avgs.push({"x": data[data.length-1].x, "y": chunkSum/chunkSize});
    return avgs;
}

function formatSensorData(sensorData, displayTimeRange) {
    const debug_tag = 'formatSensorData';

    const chartData = sensorData.map(entry => {
      return {"x": new Date(entry.createdAt), "y": entry.data.uid ? (entry.data.is_valid == "1" ? 1 : 0) : parseFloat(entry.data)}
    });
    const maxEntrySize = 15;
    const maxTimeSpan = 1000000;
    const timeSpan = new Date(displayTimeRange.end) - new Date(displayTimeRange.start);
    const timeNonce = timeSpan / 100000;
    const baseChunkSize = 5;
    const chunkSize = (sensorData.length > maxEntrySize && timeSpan > maxTimeSpan) ? Math.floor(timeNonce/baseChunkSize) : 0;
    const formattedData = chunkSize == 0 ? chartData : averageData(chartData, chunkSize);

    const debug_data_collection = [
        {
            "title": 'formattedData',
            "value": formattedData,
            "type": 1
        }
    ];
    debugHere(debug_tag, debug_data_collection);
    return formattedData;
}

function storeData(endpointName, data) {            //Dependency to sensorData
    const debug_tag = 'storeData';
    const localStorageData = JSON.parse(localStorage.getItem(endpointName)) || [];

    data = {...data, 'createdAt': new Date()};
    localStorageData.push(data);
    localStorage.setItem(endpointName, JSON.stringify(localStorageData));

    sensorData[endpointName] = localStorageData;

    const debug_data_collection = [
        {
            "title": `sensorData[${endpointName}]`,
            "value": sensorData[endpointName],
            "type": 1
        }
    ];
    debugHere(debug_tag, debug_data_collection);
}

async function fetchData(endpointName) {    //Dependency to SERVER_URL
    try {
        const response = await fetch(SERVER_URL + endpointName);
        let data = await response.json();

        if (data) {
            storeData(endpointName, data);
        }
    } catch (error) {
        console.error('Error fetching or storing data:', error);
    }
}

function getProcessedChartData(chartElId) {      //Dependency to sensorData and CHARTS_INFO
    const debug_tag = 'getProcessedChartData';

    const chartInfo = CHARTS_INFO[chartElId];
    let processedChartData;
    if (chartInfo.chartType == 0) {
        processedChartData = {
            "sensorData": formatSensorData(sensorData[chartInfo.endpointName], getChartTimeRange(chartElId)),
            "missingData": formatSensorData(missingDataSpectrum(sensorData[chartInfo.endpointName], getChartTimeRange(chartElId)), getChartTimeRange(chartElId))};
    }
    else if (chartInfo.chartType == 1) {
        processedChartData = {
            "sensorData": formatSensorData(sensorData[chartInfo.endpointName], getChartTimeRange(chartElId)),
            "missingData": formatSensorData(sensorData[chartInfo.endpointName], getChartTimeRange(chartElId))};
    }

    const debug_data_collection = [
        {
            "title": 'switch',
            "value": chartInfo.chartType,
            "type": 0
        },
        {
            "title": 'processedChartData',
            "value": processedChartData,
            "type": 1
        }
    ];
    debugHere(debug_tag, debug_data_collection);
    return processedChartData;
}

function getChartTimeRange(chartElId) {     //Dependency to CHART_INFO
    const chartInfo = CHARTS_INFO[chartElId];
    if (chartInfo.chartType == 0) {
        return {"start": new Date(new Date().getTime() - 1 * 60 * 1000), "end": new Date(new Date().getTime() - 5 * 1000)}
    }
    else if (chartInfo.chartType == 1) {
        return {"start": new Date(new Date().getTime() - 1 * 60 * 60 * 1000), "end": new Date(new Date().getTime() - 5 * 1000)}
    }
}

function updateSensorDisplayEls() {     //Dependecy to sensorData and CHARTS_INFO
    const sensorDisplayEls = document.getElementsByClassName("sensor-display");
    const sensorStateDisplayEls = document.getElementsByClassName("sensor-state-display");

    Array.from(sensorDisplayEls).forEach((sensorDisplayEl, i) => {
        const endpointName = sensorDisplayEl.getAttribute("data-endpointName");
        const sensorLastValue = sensorData[endpointName].at(-1).data;
        const missingDataValue = missingDataSpectrum(sensorData[endpointName], getChartTimeRange(CHARTS_IDS[i]));
        const sensorDisplayValue =  checkStruct(missingDataValue) ? missingDataValue.at(-1).data : sensorLastValue;
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
        const sensorLastValue = sensorData[endpointName].at(-1).data;
        const missingDataValue = missingDataSpectrum(sensorData[endpointName], getChartTimeRange(CHARTS_IDS[i]));
        const sensorStateValue =  checkStruct(missingDataValue) ? "Unknown" : sensorLastValue.uid ? (sensorLastValue.is_valid ? "Access granted" : "Access denied") : (sensorLastValue ? "Detected" : "None");
        const sensorStateLastState = sensorLastValue.uid ? sensorLastValue.uid : (sensorLastValue ? "Detected" : "None");
        const sensorStateCurrentState = checkStruct(missingDataValue) ? false : sensorLastValue.uid ? (sensorLastValue.is_valid ? true : false) : (sensorLastValue ? true : false);

        const sensorStateValueEl = sensorStateDisplayEl.getElementsByClassName('__sensor-state-value')[0];
        const sensorStateLastStateEl = sensorStateDisplayEl.getElementsByClassName('__sensor-state-last-state')[0];
        const sensorStateTrueEls = sensorStateDisplayEl.getElementsByClassName('__sensor-state-true');
        const sensorStateFalseEls = sensorStateDisplayEl.getElementsByClassName('__sensor-state-false');
        sensorStateValueEl.textContent = sensorStateValue;
        sensorStateLastStateEl.textContent = sensorStateLastState;
        Array.from(sensorStateTrueEls).forEach(sensorStateTrueEl => {
            sensorStateCurrentState ? sensorStateTrueEl.classList.remove('hidden') : sensorStateTrueEl.classList.add('hidden');
        })
        Array.from(sensorStateFalseEls).forEach(sensorStateFalseEl => {
            sensorStateCurrentState ? sensorStateFalseEl.classList.add('hidden') : sensorStateFalseEl.classList.remove('hidden');
        })
    });
}

function setChart(chartElId) {     //Dependecy to charData
    const ctx = document.getElementById(chartElId).getContext('2d');
    const chartInfo = CHARTS_INFO[chartElId];
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
                    display: true, // Remove X-axis labels
                    grid: {
                    display: false // Remove grid lines for X-axis
                    },
                    ticks: {
                    display: true // Remove ticks (numbers) on X-axis
                    },
                    min: getChartTimeRange(chartElId).start,
                    max: getChartTimeRange(chartElId).end
                },
                y: {
                    display: true, // Remove Y-axis labels
                    grid: {
                    display: false // Remove grid lines for Y-axis
                    },
                    ticks: {
                    display: true // Remove ticks (numbers) on Y-axis
                    },
                    min: 0,
                }
            }
        }
        data = {
            datasets: [
                { 
                    data: getProcessedChartData(chartElId).sensorData,
                    fill: false,
                    tension: 0.5,
                    pointRadius: 0,
                    borderColor: function(context) {
                        const gradient = ctx.createLinearGradient(0, 0, context.chart.width, 0);
                        gradient.addColorStop(0, 'rgba(31, 31, 31, 0)'); // Solid color at the start
                        gradient.addColorStop(0.5, 'rgba(48, 228, 142, 1)'); // Start fading at 20%
                        gradient.addColorStop(1, 'rgba(31, 31, 31, 0)'); // Solid color at the end
                        return gradient;
                    },
                },
                { 
                    data: getProcessedChartData(chartElId).missingData,
                    fill: false,
                    tension: 0.5,
                    pointRadius: 0,
                    borderColor: function(context) {
                        const gradient = ctx.createLinearGradient(0, 0, context.chart.width, 0);
                        gradient.addColorStop(0, 'rgba(31, 31, 31, 0)'); // Solid color at the start
                        gradient.addColorStop(0.5, 'rgb(228, 48, 48)'); // Start fading at 20%
                        gradient.addColorStop(1, 'rgba(31, 31, 31, 0)'); // Solid color at the end
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
                min: getChartTimeRange(chartElId).start,
                max: getChartTimeRange(chartElId).end
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
                data: getProcessedChartData(chartElId).sensorData,
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
                data: getProcessedChartData(chartElId).sensorData,
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
            },/*
            { 
                data: getProcessedChartData(chartElId).missingData,
                fill: true,
                tension: 0.5,
                pointRadius: 0,
                borderColor: "rgba(228, 48, 48, 1)",
                backgroundColor: function(context) {
                const gradient = ctx.createLinearGradient(0, 0, 0, context.chart.height);
                gradient.addColorStop(0.5, 'rgba(228, 48, 48, 0.1)');
                gradient.addColorStop(1, 'rgba(31, 31, 31, 0)');
                return gradient;
                },
            },*/
            ]
        };
    }

    return new Chart(chartElId, {
        type: "line",
        data: data,
        options: options
    });
}

async function updateAll(isInit) {      //Dependecy to CHART_IDS, CHART_INFO and ChartInsts
    const debug_tag = 'updateAll';

    for (let i = 0; i < CHARTS_IDS.length; i++) {
        const chartInfo = CHARTS_INFO[CHARTS_IDS[i]];
        if (chartInfo.endpointType == 'GET') await fetchData(chartInfo.endpointName);
    }
    updateSensorDisplayEls();
    if (isInit) {
        for (let i = 0; i < CHARTS_IDS.length; i++) {
            chartInsts[CHARTS_IDS[i]] = setChart(CHARTS_IDS[i]);
        }
    } else {
        for (let i = 0; i < CHARTS_IDS.length; i++) {
            chartInsts[CHARTS_IDS[i]].data.datasets[0].data = getProcessedChartData(CHARTS_IDS[i]).sensorData;
            chartInsts[CHARTS_IDS[i]].data.datasets[1].data = getProcessedChartData(CHARTS_IDS[i]).missingData;
            chartInsts[CHARTS_IDS[i]].options.scales.x.min = getChartTimeRange(CHARTS_IDS[i]).start;
            chartInsts[CHARTS_IDS[i]].options.scales.x.max = getChartTimeRange(CHARTS_IDS[i]).end;
            chartInsts[CHARTS_IDS[i]].update();

            const debug_data_collection = [
                {
                    "title": 'switch',
                    "value": isInit,
                    "type": 0
                },
                {
                    "title": `chartInsts[${CHARTS_IDS[i]}].data.datasets[0].data`,
                    "value": chartInsts[CHARTS_IDS[i]].data.datasets[0].data,
                    "type": 1
                }
            ];
            debugHere(debug_tag, debug_data_collection);
        }
    }
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