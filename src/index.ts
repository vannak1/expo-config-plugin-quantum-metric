import {
  ConfigPlugin,
  IOSConfig,
  AndroidConfig,
  withAppDelegate,
  withMainApplication,
  withXcodeProject,
  withDangerousMod,
  createRunOncePlugin,
  withGradleProperties,
  withAndroidManifest,
  withAppBuildGradle,
  withProjectBuildGradle,
  withPodfile,
} from "@expo/config-plugins";
import { ExpoConfig } from "@expo/config-types";
import * as path from "path";
import { existsSync } from "fs-extra";

/**
 * Quantum Metric configuration properties.
 */
interface QuantumMetricPluginProps {
  // Required properties
  subscription: string;
  uid: string;
  // Authentication
  username: string;
  password: string;
  // Optional properties
  browserName?: string;
  enableTestMode?: boolean;
  disableCrashReporting?: boolean;
  // Version control
  podVersion?: string;
  aarVersion?: string;
}

const DEFAULT_POD_VERSION = "1.1.66";
const DEFAULT_AAR_VERSION = "1.1.71";

/**
 * Compare version strings
 */
const isVersionGreaterOrEqual = (version: string | undefined, compareWith: string): boolean => {
  if (!version) return false;
  const v1 = version.split('.').map(Number);
  const v2 = compareWith.split('.').map(Number);
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const num1 = v1[i] || 0;
    const num2 = v2[i] || 0;
    if (num1 > num2) return true;
    if (num1 < num2) return false;
  }
  return true;
};

/**
 * iOS – Add Quantum Metric pod to Podfile
 */
const withQuantumMetricIosPod: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => {
  const { username, password, podVersion = DEFAULT_POD_VERSION } = props;

  if (!username || !password) {
    throw new Error("Quantum Metric plugin requires both username and password properties for iOS integration");
  }
  

  // Use withPodfile to modify the Podfile directly
  return withPodfile(config, (config: any) => {
    const podSource = `https://${username}:${password}@sdk.quantummetric.com/cocoapods/Quantum-SDK-iOS.git`;
    
    // Check if the pod is already added
    if (!config.modResults.contents.includes("QuantumMetric-SDK")) {
      // Add pod to Podfile
      const podLine = `  pod 'QuantumMetric-SDK', '${podVersion}', :source => '${podSource}'`;
      
      // Find target line to add the pod after
      const targetPattern = /target ['"].*['"] do/g;
      const matches = config.modResults.contents.match(targetPattern);
      
      if (matches && matches.length > 0) {
        // Add after the first target declaration
        config.modResults.contents = config.modResults.contents.replace(
          matches[0],
          `${matches[0]}\n${podLine}`
        );
      } else {
        // Fallback - add to the top of the file
        config.modResults.contents = `${podLine}\n\n${config.modResults.contents}`;
        console.warn("Quantum Metric: Could not find target declaration in Podfile. Placed pod at the top of the file.");
      }
    } else {
      console.log("Quantum Metric: Pod already in Podfile. Skipping addition.");
    }
    
    return config;
  });
};

/**
 * iOS – Modify AppDelegate to initialize Quantum Metric SDK.
 */
const withQuantumMetricIosAppDelegate: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => withAppDelegate(config, (config) => {
  const { subscription, uid, browserName, enableTestMode, disableCrashReporting } = props;
  let appDelegate = config.modResults.contents;
  const isSwift = config.modResults.path.endsWith(".swift");

  if (isSwift) {
    // Step 2A - Importing for Swift
    if (!appDelegate.includes("import QMNative")) {
      appDelegate = appDelegate.replace(/(import UIKit\s*\n)/, "$1import QMNative\n");
    }

    // Step 2B - Initialization for Swift
    if (!appDelegate.includes("QMNative.initialize")) {
      const didFinishRegex = /(func\s+application\([^)]*didFinishLaunchingWithOptions[^)]*\)\s*->\s*Bool\s*\{)/;

      // Create initialization code according to documentation
      let initCode = `\n        // Initialize Quantum Metric\n        QMNative.initialize(withSubscription: "${subscription}", uid: "${uid}")`;

      // Optional: Browser Name
      if (browserName) {
        initCode += `\n        QMNative.setBrowserString("${browserName}")`;
      }

      // Additional optional settings
      if (disableCrashReporting) {
        initCode += `\n        QMNative.disableCrashReporting()`;
      }

      if (enableTestMode) {
        initCode += `\n        QMNative.enableTestConfig(true)`;
      }

      // Add initialization to didFinishLaunchingWithOptions
      if (didFinishRegex.test(appDelegate)) {
        appDelegate = appDelegate.replace(didFinishRegex, `$1${initCode}`);
      } else {
        console.warn("Quantum Metric: didFinishLaunchingWithOptions not found in Swift AppDelegate.");
      }
    }
  } else {
    // Step 2A - Importing for Objective-C
    if (!appDelegate.includes("#import <QMNative/QMNative.h>")) {
      // Using the modern header format as we're requiring version 1.1.66 or higher
      const headerImport = '#import <QMNative/QMNative.h>';

      appDelegate = appDelegate.replace(
        /#import "AppDelegate.h"/,
        `#import "AppDelegate.h"\n${headerImport}`
      );
    }

    // Step 2B - Initialization for Objective-C
    if (!appDelegate.includes("[QMNative initializeWithSubscription:")) {
      // Create initialization code according to documentation
      let qmInitCode = `\n  // Initialize Quantum Metric\n  [QMNative initializeWithSubscription:@"${subscription}" uid:@"${uid}"];\n`;

      // Optional: Browser Name
      if (browserName) {
        qmInitCode += `  [QMNative setBrowserString:@"${browserName}"];\n`;
      }

      // Additional optional settings
      if (disableCrashReporting) {
        qmInitCode += `  [QMNative disableCrashReporting];\n`;
      }

      if (enableTestMode) {
        qmInitCode += `  [[QMNative sharedInstance] enableTestConfig:YES];\n`;
      }

      // Look for Expo style return pattern in Objective-C
      const expoReturnPattern = /return\s+\[\s*super\s+application\s*:\s*application\s+didFinishLaunchingWithOptions\s*:\s*launchOptions\s*\]\s*;/;

      // First try to match Expo's return pattern
      if (expoReturnPattern.test(appDelegate)) {
        appDelegate = appDelegate.replace(
          expoReturnPattern,
          `${qmInitCode}  return [super application:application didFinishLaunchingWithOptions:launchOptions];`
        );
      }
      // Fall back to standard return pattern if Expo pattern not found
      else {
        appDelegate = appDelegate.replace(
          /return\s+YES\s*;/,
          `${qmInitCode}  return YES;`
        );
      }
    }
  }

  config.modResults.contents = appDelegate;
  return config;
});

/**
 * Android – Add Maven repository for Quantum Metric SDK
 */
const withQuantumMetricMavenRepo: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => {
  const { username, password } = props;

  if (!username || !password) {
    throw new Error("Quantum Metric plugin requires both username and password properties for Android integration");
  }

  // Add Maven repository credentials to gradle.properties using the utility function
  config = withQuantumMetricGradleProps(config, props);

  // Add the Maven repository to build.gradle
  return withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("sdk.quantummetric.com/maven-releases")) {
      // Add the Maven repository using pattern matching on the repositories block
      const mavenRepo = `
        maven {
            url "https://sdk.quantummetric.com/maven-releases"
            credentials {
                username "\${quantummetric.maven.username}"
                password "\${quantummetric.maven.password}"
            }
        }`;
      
      const pattern = /allprojects\s*\{\s*repositories\s*\{/g;
      if (pattern.test(config.modResults.contents)) {
        config.modResults.contents = config.modResults.contents.replace(
          /allprojects\s*\{\s*repositories\s*\{/,
          `allprojects {\n    repositories {${mavenRepo}`
        );
      } else {
        // If the pattern doesn't match, try another common pattern
        config.modResults.contents = config.modResults.contents.replace(
          /repositories\s*\{/,
          `repositories {${mavenRepo}`
        );
      }
    }
    
    return config;
  });
};

/**
 * Android – Add Quantum Metric dependency to app build.gradle
 */
const withQuantumMetricGradle: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => {
  const { aarVersion = DEFAULT_AAR_VERSION } = props;
  
  return withAppBuildGradle(config, (config) => {
    // Check if quantum metric dependency is already added
    if (!config.modResults.contents.includes("com.quantummetric:")) {
      // Add the dependency by modifying the contents directly
      const dependency = `    implementation 'com.quantummetric:quantummetric-android:${aarVersion}'`;
      
      // Find the dependencies block and add our dependency
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n${dependency}`
      );
    }
    
    return config;
  });
};

/**
 * Create a build gradle properties config plugin for Quantum Metric credentials
 */
const withQuantumMetricGradleProps = AndroidConfig.BuildProperties.createBuildGradlePropsConfigPlugin<QuantumMetricPluginProps>([
  {
    propName: 'quantummetric.maven.username',
    propValueGetter: (props) => props.username || '',
  },
  {
    propName: 'quantummetric.maven.password',
    propValueGetter: (props) => props.password || '',
  },
], 'withQuantumMetricGradleProps');

/**
 * Android – Modify MainApplication to initialize Quantum Metric SDK
 */
const withQuantumMetricMainApplication: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => {
  const { subscription, uid, browserName, enableTestMode } = props;
  
  return withMainApplication(config, (config) => {
    let mainApplication = config.modResults.contents;
    const isKotlin = mainApplication.includes("fun onCreate(");
    
    if (isKotlin) {
      // Add import if not present
      if (!mainApplication.includes("import com.quantummetric.QuantumMetric")) {
        mainApplication = mainApplication.replace(
          /package\s+([a-zA-Z0-9_.]+)/,
          `package $1\n\nimport com.quantummetric.QuantumMetric`
        );
      }
      
      // Add initialization if not present
      if (!mainApplication.includes("QuantumMetric.initialize")) {
        let qmInitCode = `\n    // Initialize Quantum Metric\n    QuantumMetric\n        .initialize("${subscription}", "${uid}", this)`;
        
        if (browserName) {
          qmInitCode += `\n        .withBrowserName("${browserName}")`;
        }
        
        if (enableTestMode) {
          qmInitCode += `\n        .enableTestMode()`;
        }
        
        qmInitCode += `\n        .start()\n`;
        
        const onCreateRegex = /(super\.onCreate\(\))/;
        mainApplication = mainApplication.replace(onCreateRegex, `$1\n${qmInitCode}`);
      }
    } else {
      // Add import if not present
      if (!mainApplication.includes("import com.quantummetric.QuantumMetric")) {
        mainApplication = mainApplication.replace(
          /package\s+([a-zA-Z0-9_.]+);/,
          `package $1;\n\nimport com.quantummetric.QuantumMetric;`
        );
      }
      
      // Add initialization if not present
      if (!mainApplication.includes("QuantumMetric.initialize")) {
        let qmInitCode = `\n    // Initialize Quantum Metric\n    QuantumMetric\n            .initialize("${subscription}", "${uid}", this)`;
        
        if (browserName) {
          qmInitCode += `\n            .withBrowserName("${browserName}")`;
        }
        
        if (enableTestMode) {
          qmInitCode += `\n            .enableTestMode()`;
        }
        
        qmInitCode += `\n            .start();\n`;
        
        const onCreateRegex = /(super\.onCreate\(\);)(\s*(?:\/\/.*)?)/;
        mainApplication = mainApplication.replace(onCreateRegex, `$1$2${qmInitCode}`);
      }
    }
    
    config.modResults.contents = mainApplication;
    return config;
  });
};

/**
 * Main plugin: Apply all modifications for both iOS and Android
 */
const withQuantumMetric: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => {
  // Set default values for optional properties
  const pluginProps = {
    ...props,
    podVersion: props.podVersion || DEFAULT_POD_VERSION,
    aarVersion: props.aarVersion || DEFAULT_AAR_VERSION
  };
  
  // Validate required parameters
  if (!pluginProps.subscription || !pluginProps.uid) {
    throw new Error(
      "Quantum Metric plugin requires both subscription and uid properties"
    );
  }
  
  // Validate authentication
  if (!pluginProps.username || !pluginProps.password) {
    throw new Error(
      "Quantum Metric plugin requires username and password properties for authentication"
    );
  }
  
  // Validate minimum iOS version
  const podVersion = pluginProps.podVersion;
  if (podVersion && !isVersionGreaterOrEqual(podVersion, '1.1.66')) {
    throw new Error(
      "Quantum Metric iOS SDK version must be 1.1.66 or higher"
    );
  }
  
  // Log plugin setup information
  console.log(`Configuring Quantum Metric SDK with subscription: ${pluginProps.subscription}`);
  console.log(`Using Quantum Metric SDK versions - iOS: ${pluginProps.podVersion}, Android: ${pluginProps.aarVersion}`);
  
  // Apply modifications in the correct order
  // iOS configurations
  config = withQuantumMetricIosPod(config, pluginProps);
  config = withQuantumMetricIosAppDelegate(config, pluginProps);
  
  // Android configurations
  config = withQuantumMetricMavenRepo(config, pluginProps);
  config = withQuantumMetricGradle(config, pluginProps);
  config = withQuantumMetricMainApplication(config, pluginProps);
  
  return config;
};

let pkg: { name: string; version?: string } = {
  name: "expo-config-plugin-quantum-metric",
  version: "1.0.0"
};

try {
  pkg = require("../package.json");
} catch {
  // Fallback if package.json cannot be loaded
}

export default createRunOncePlugin(
  withQuantumMetric,
  pkg.name,
  pkg.version
);