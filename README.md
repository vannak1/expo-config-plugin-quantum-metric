# expo-plugin-quantum-metric

An Expo Config Plugin for integrating the Quantum Metric SDK into your React Native application.

## Installation

```bash
# Using npm
npm install expo-plugin-quantum-metric

# Using yarn
yarn add expo-plugin-quantum-metric

# Using expo
expo install expo-plugin-quantum-metric
```

## Setup

1. **Obtain Quantum Metric SDK Files**

   You'll need to get the Quantum Metric native SDK files from your Quantum Metric Account Executive:
   
   - For iOS: The `libQMNative.xcframework` file
   - For Android: The `.aar` file
   
   Place these files in a directory in your project. By default, the plugin looks for them in:
   
   ```
   your-project-root/vendor-config/quantum-metric/
   ```

2. **Configure your app.json / app.config.js**

   Add the plugin to your Expo config with your Quantum Metric subscription and UID:

   ```json
   {
     "expo": {
       "plugins": [
         [
           "expo-plugin-quantum-metric",
           {
             "subscription": "YOUR_SUBSCRIPTION_NAME",
             "uid": "YOUR_UNIQUE_SDK_UID",
             "browserName": "Optional Custom Browser Name",
             "enableTestMode": false,
             "disableCrashReporting": false,
             "libraryPath": "vendor-config/quantum-metric",
             "libraryVersion": "1.1.71"
           }
         ]
       ]
     }
   }
   ```

   **Configuration Options:**

   | Option | Type | Required | Default | Description |
   |--------|------|----------|---------|-------------|
   | `subscription` | String | Yes | - | Your Quantum Metric subscription name |
   | `uid` | String | Yes | - | Your unique SDK UID |
   | `browserName` | String | No | App Name | Custom browser name for better identification |
   | `enableTestMode` | Boolean | No | `false` | Whether to enable test mode configuration |
   | `disableCrashReporting` | Boolean | No | `false` | Whether to disable crash reporting (iOS only) |
   | `libraryPath` | String | No | `"vendor-config/quantum-metric"` | Path to your Quantum Metric native libraries |
   | `libraryVersion` | String | No | - | Version of the Quantum Metric SDK being used (affects iOS header imports) |

3. **Rebuild your app**

   ```bash
   # Using Expo Dev Client
   expo prebuild --clean
   
   # Or with EAS Build
   eas build --platform all
   ```

## Usage in your React Native application

After installing and configuring the plugin, you'll need to install the React Native Quantum Metric library:

```bash
npm install react-native-quantum-metric-library
```

To send events to Quantum Metric, you can use the JavaScript API from your React Native code:

```javascript
import QM from 'react-native-quantum-metric-library'; // You'll need to implement this JS wrapper

// Send an event
QM.sendEvent(101, "Hello World!");

// Send a conversion event
QM.sendEvent(102, "Purchase Complete", { type: "conversion", value: 99.99 });
```

## Advanced Usage

For advanced usage such as getting session cookies, sending errors, or handling API calls, refer to the Quantum Metric documentation provided by your Account Executive.

## Troubleshooting

### iOS

- **Framework not found**: Make sure the `.xcframework` file is correctly placed in the specified directory.
- **Linking errors**: Verify that the `-ObjC` flag has been added to your project.
- **Header import issues**: If you're seeing header import errors, verify that you've set the correct `libraryVersion`. For SDK versions 1.1.71 and above, the plugin uses `<QMNative/QMNative.h>`; for earlier versions, it uses `"QMNative.h"`.

### Android

- **AAR file not found**: Ensure the `.aar` file is correctly placed in the specified directory.
- **Initialization issues**: Check your logs for any Quantum Metric initialization errors.

## License

MIT