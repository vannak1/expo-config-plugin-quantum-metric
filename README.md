# expo-quantum-metric

An Expo Config Plugin for integrating the Quantum Metric SDK into your React Native application.

> **DISCLAIMER**: This package is not officially created, maintained, or supported by Quantum Metric. The author is not associated with Quantum Metric in any capacity. This implementation is shared to help other developers integrate the Quantum Metric SDK with Expo and React Native applications.

## Installation

```bash
# Using npm
npm install expo-quantum-metric

# Using yarn
yarn add expo-quantum-metric

# Using expo
expo install expo-quantum-metric
```

You also need to install the React Native Quantum Metric library:

```bash
npm install react-native-quantum-metric-library
# or
yarn add react-native-quantum-metric-library
```

For React Native library usage and details, please consult the [react-native-quantum-metric-library](https://www.npmjs.com/package/react-native-quantum-metric-library) documentation.

## Requirements

- **Expo SDK**: 52 or higher
- **Quantum Metric iOS SDK**: Version 1.1.66 or higher required

## Setup

Add the plugin to your Expo config with your Quantum Metric subscription and authentication details:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-quantum-metric",
        {
          "subscription": "YOUR_SUBSCRIPTION_NAME",
          "uid": "YOUR_UNIQUE_SDK_UID",
          "username": "YOUR_QM_USERNAME",  
          "password": "YOUR_QM_PASSWORD",
          "browserName": "Optional Custom Browser Name",
          "enableTestMode": false,
          "disableCrashReporting": false,
          "podVersion": "1.1.71",
          "aarVersion": "1.0.18"
        }
      ]
    ]
  }
}
```

## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `subscription` | String | Yes | - | Your Quantum Metric subscription name |
| `uid` | String | Yes | - | Your unique SDK UID |
| `username` | String | Yes | - | Your Quantum Metric repository username |
| `password` | String | Yes | - | Your Quantum Metric repository password |
| `browserName` | String | No | App Name | Custom browser name for better identification |
| `enableTestMode` | Boolean | No | `false` | Whether to enable test mode configuration |
| `disableCrashReporting` | Boolean | No | `false` | Whether to disable crash reporting |
| `podVersion` | String | No | `"1.1.71"` | iOS SDK version (must be 1.1.66 or higher) |
| `aarVersion` | String | No | `"1.0.18"` | Android SDK version (must be 1.0.18 or higher) |

## Security Best Practices

It's recommended to use environment variables for sensitive information like username and password:

```javascript
// app.config.js
export default {
  expo: {
    plugins: [
      [
        'expo-quantum-metric',
        {
          subscription: process.env.QM_SUBSCRIPTION,
          uid: process.env.QM_UID,
          username: process.env.QM_USERNAME,
          password: process.env.QM_PASSWORD,
          browserName: 'MyApp-Production',
        },
      ],
    ],
  },
};
```

## Rebuilding Your App

After configuring the plugin, you'll need to rebuild your native code:

```bash
# Using Expo Dev Client
expo prebuild --clean
npx expo run:ios
npx expo run:android

# Or with EAS Build
eas build --platform all
```

## SDK Features

The plugin automatically configures the following features:

### iOS
- Integrates the Quantum Metric SDK via CocoaPods
- Initializes the SDK in your AppDelegate
- Configures optional features like crash reporting and test mode
- Supports both Swift and Objective-C projects

### Android
- Adds the Maven repository with secure credential handling
- Adds necessary permissions (internet and network state)
- Initializes the SDK in your MainApplication
- Configures optional features like browser name and test mode

## SDK Usage in Your Application

After integration, you can use the Quantum Metric functionality through the React Native library:

```javascript
import QM from 'react-native-quantum-metric-library';

For complete API documentation and advanced usage, please consult the [React Native Quantum Metric Library](https://www.npmjs.com/package/react-native-quantum-metric-library) documentation.

## Troubleshooting

### iOS
- **Pod Install Errors**: Verify your username and password are correct
- **SDK Initialization Issues**: Check console logs for Quantum Metric errors
- **Missing Sessions**: Use the session callback to debug (see Quantum Metric docs)

### Android
- **Maven Repository Errors**: Verify your username and password are correct
- **Initialization Issues**: Set up error listeners to catch initialization problems
- **Permissions Issues**: Ensure your app has internet and network state permissions

## Getting Help

If you encounter issues, check the following:

1. Verify you have the correct credentials from your Quantum Metric account team
2. Make sure you're using the correct subscription ID and UID
3. Check build logs for any error messages related to Quantum Metric

## License

MIT