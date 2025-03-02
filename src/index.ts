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
 * iOS – Modify AppDelegate to initialize Quantum Metric SDK.
 */
const withQuantumMetricIosAppDelegate: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => withAppDelegate(config, (config) => {
  const { subscription, uid, browserName, enableTestMode, disableCrashReporting } = props;
  let appDelegate = config.modResults.contents;
  const isSwift = config.modResults.path.endsWith(".swift");

  if (isSwift) {
    // Import for Swift
    if (!appDelegate.includes("import QMNative")) {
      appDelegate = appDelegate.replace(/(import UIKit\s*\n)/, "$1import QMNative\n");
    }
    // Initialization for Swift
    if (!appDelegate.includes("QMNative.initialize")) {
      const didFinishRegex = /(func\s+application\([^)]*didFinishLaunchingWithOptions[^)]*\)\s*->\s*Bool\s*\{)/;
      let initCode = `\n        // Initialize Quantum Metric\n        QMNative.initialize(withSubscription: "${subscription}", uid: "${uid}")`;
      if (browserName) {
        initCode += `\n        QMNative.setBrowserString("${browserName}")`;
      }
      if (disableCrashReporting) {
        initCode += `\n        QMNative.disableCrashReporting()`;
      }
      if (enableTestMode) {
        initCode += `\n        QMNative.enableTestConfig(true)`;
      }
      if (didFinishRegex.test(appDelegate)) {
        appDelegate = appDelegate.replace(didFinishRegex, `$1${initCode}`);
      } else {
        console.warn("Quantum Metric: didFinishLaunchingWithOptions not found in Swift AppDelegate.");
      }
    }
  } else {
    // Import for Objective-C
    if (!appDelegate.includes("#import <QMNative/QMNative.h>")) {
      const headerImport = '#import <QMNative/QMNative.h>';
      appDelegate = appDelegate.replace(
        /#import "AppDelegate.h"/,
        `#import "AppDelegate.h"\n${headerImport}`
      );
    }
    // Initialization for Objective-C
    if (!appDelegate.includes("[QMNative initializeWithSubscription:")) {
      let qmInitCode = `\n  // Initialize Quantum Metric\n  [QMNative initializeWithSubscription:@"${subscription}" uid:@"${uid}"];\n`;
      if (browserName) {
        qmInitCode += `  [QMNative setBrowserString:@"${browserName}"];\n`;
      }
      if (disableCrashReporting) {
        qmInitCode += `  [QMNative disableCrashReporting];\n`;
      }
      if (enableTestMode) {
        qmInitCode += `  [[QMNative sharedInstance] enableTestConfig:YES];\n`;
      }
      const expoReturnPattern = /return\s+\[\s*super\s+application\s*:\s*application\s+didFinishLaunchingWithOptions\s*:\s*launchOptions\s*\]\s*;/;
      if (expoReturnPattern.test(appDelegate)) {
        appDelegate = appDelegate.replace(
          expoReturnPattern,
          `${qmInitCode}  return [super application:application didFinishLaunchingWithOptions:launchOptions];`
        );
      } else {
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
 * iOS – Add Quantum Metric pod to Podfile with credentials.
 */
const withQuantumMetricIosPod: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => {
  const { username, password, podVersion = DEFAULT_POD_VERSION } = props;

  if (!username || !password) {
    throw new Error("Quantum Metric plugin requires both username and password properties for iOS integration");
  }

  return withPodfile(config, (config) => {
    if (!config.modResults.contents.includes("QuantumMetric-SDK")) {
      const credentialsSetup = `
# Quantum Metric credentials
ENV['QM_USER'] = '${username}'
ENV['QM_PASS'] = '${password}'
`;
      const podLine = `  pod 'QuantumMetric-SDK', :git => "https://\#{ENV['QM_USER']}:\#{ENV['QM_PASS']}@sdk.quantummetric.com/cocoapods/Quantum-SDK-iOS.git", :tag => '${podVersion}'`;
      const targetPattern = /target ['"].*['"] do/g;
      const matches = config.modResults.contents.match(targetPattern);
      if (!config.modResults.contents.includes("# Quantum Metric credentials")) {
        config.modResults.contents = `${credentialsSetup}\n${config.modResults.contents}`;
      }
      if (matches && matches.length > 0) {
        config.modResults.contents = config.modResults.contents.replace(
          matches[0],
          `${matches[0]}\n${podLine}`
        );
      } else {
        const podfileContent = config.modResults.contents;
        const lines = podfileContent.split('\n');
        let insertIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('platform :ios') || lines[i].includes('use_frameworks')) {
            insertIndex = i + 1;
            break;
          }
        }
        if (insertIndex >= 0) {
          lines.splice(insertIndex, 0, podLine);
          config.modResults.contents = lines.join('\n');
        } else {
          config.modResults.contents += `\n${podLine}\n`;
          console.warn("Quantum Metric: Could not find target declaration in Podfile. Placed pod at a suitable location.");
        }
      }
    } else {
      console.log("Quantum Metric: Pod already in Podfile. Skipping addition.");
    }

    return config;
  });
};

/**
 * New mod: Update Xcode project build settings so that the framework search paths include the Quantum Metric SDK.
 */
const withQuantumMetricXcodeProject: ConfigPlugin<QuantumMetricPluginProps> = (config, _props) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    // Loop through each build configuration and update FRAMEWORK_SEARCH_PATHS.
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key in buildConfigs) {
      if (
        typeof buildConfigs[key] === 'object' &&
        buildConfigs[key].buildSettings
      ) {
        const buildSettings = buildConfigs[key].buildSettings;
        buildSettings['FRAMEWORK_SEARCH_PATHS'] = buildSettings['FRAMEWORK_SEARCH_PATHS'] || '$(inherited)';
        if (!buildSettings['FRAMEWORK_SEARCH_PATHS'].includes('$(PODS_ROOT)/QuantumMetric-SDK')) {
          buildSettings['FRAMEWORK_SEARCH_PATHS'] += ' "$(PODS_ROOT)/QuantumMetric-SDK"';
        }
      }
    }
    return config;
  });
};

/**
 * Android – Create build gradle properties config plugin for Quantum Metric credentials.
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
 * Android – Add Maven repository for Quantum Metric SDK.
 */
const withQuantumMetricMavenRepo: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => {
  const { username, password } = props;

  if (!username || !password) {
    throw new Error("Quantum Metric plugin requires both username and password properties for Android integration");
  }

  config = withQuantumMetricGradleProps(config, props);

  return withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("sdk.quantummetric.com/maven-releases")) {
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
 * Android – Add Quantum Metric dependency to app build.gradle.
 */
const withQuantumMetricGradle: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => {
  const { aarVersion = DEFAULT_AAR_VERSION } = props;

  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("com.quantummetric:")) {
      const dependency = `    implementation 'com.quantummetric:quantummetric-android:${aarVersion}'`;
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n${dependency}`
      );
    }

    return config;
  });
};

/**
 * Android – Modify MainApplication to initialize Quantum Metric SDK.
 */
const withQuantumMetricMainApplication: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => {
  const { subscription, uid, browserName, enableTestMode } = props;

  return withMainApplication(config, (config) => {
    let mainApplication = config.modResults.contents;
    const isKotlin = mainApplication.includes("fun onCreate(");

    if (isKotlin) {
      if (!mainApplication.includes("import com.quantummetric.QuantumMetric")) {
        mainApplication = mainApplication.replace(
          /package\s+([a-zA-Z0-9_.]+)/,
          `package $1\n\nimport com.quantummetric.QuantumMetric`
        );
      }
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
      if (!mainApplication.includes("import com.quantummetric.QuantumMetric")) {
        mainApplication = mainApplication.replace(
          /package\s+([a-zA-Z0-9_.]+);/,
          `package $1;\n\nimport com.quantummetric.QuantumMetric;`
        );
      }
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
 * Main plugin: Apply all modifications for both iOS and Android.
 */
const withQuantumMetric: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => {
  const pluginProps = {
    ...props,
    podVersion: props.podVersion || DEFAULT_POD_VERSION,
    aarVersion: props.aarVersion || DEFAULT_AAR_VERSION
  };

  if (!pluginProps.subscription || !pluginProps.uid) {
    throw new Error("Quantum Metric plugin requires both subscription and uid properties");
  }
  if (!pluginProps.username || !pluginProps.password) {
    throw new Error("Quantum Metric plugin requires username and password properties for authentication");
  }
  const podVersion = pluginProps.podVersion;
  if (podVersion && !isVersionGreaterOrEqual(podVersion, '1.1.66')) {
    throw new Error("Quantum Metric iOS SDK version must be 1.1.66 or higher");
  }
  
  // iOS modifications
  config = withQuantumMetricIosPod(config, pluginProps);
  config = withQuantumMetricIosAppDelegate(config, pluginProps);
  config = withQuantumMetricXcodeProject(config, pluginProps);

  // Android modifications
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
  console.log("Note: Using default package information as package.json could not be loaded.");
}

export default createRunOncePlugin(
  withQuantumMetric,
  pkg.name,
  pkg.version
);
