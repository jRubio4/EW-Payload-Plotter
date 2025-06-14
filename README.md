# EW Payload Plotter

A web-based tool for decoding and visualizing payload data from FARMO products. This tool supports various devices including Water Rat, Analog devices (WLM, RG, EFS), SDI-12, and People Counter.

## Features

- Frame decoding for various FARMO products
- Real-time data visualization using Chart.js
- Support for multiple device types:
  - Water Rat
  - Analog devices (Water Level Monitor, Rain Gauge, Electric Fence Sensor)
  - SDI-12
  - People Counter
- Interactive charts for:
  - Frame count
  - Battery voltage
  - Temperature
  - Device-specific measurements (water level, conductivity, etc.)

## Usage

1. Open `EW_plotter.html` in a web browser
2. Select your product type from the dropdown menu
3. For analog devices, select the specific device type
4. Use the Frame Decoder to decode individual frames
5. Use the Log Plotter to visualize data from log files

## Dependencies

- Chart.js v4.4.0
- Luxon v3.4.4
- Chart.js Luxon Adapter v1.3.1

## Browser Support

This tool works best in modern browsers that support ES6+ features and the Canvas API.

## License

[Add your license information here] 