import {
  type ConfigPlugin,
  IOSConfig,
  AndroidConfig,
  withAppDelegate,
  withMainApplication,
  withXcodeProject,
  withDangerousMod,
  createRunOncePlugin,
} from "@expo/config-plugins";
import type { ExpoConfig } from "@expo/config-types";
import * as path from "node:path";
import {
  copySync,
  copyFileSync,
  ensureDirSync,
  existsSync,
  readdirSync,
  statSync,
} from "fs-extra";

/**
 * Quantum Metric configuration properties.
 */
interface QuantumMetricPluginProps {
  subscription: string;
  uid: string;
  browserName?: string;
  enableTestMode?: boolean;
  disableCrashReporting?: boolean;
  libraryPath?: string;
}

const DEFAULT_LIBRARY_PATH = "vendor-config/quantum-metric";

/**
 * Helper to copy native items (files or folders) from a source directory to a destination directory.
 * If the source item is a directory (e.g. a .xcframework folder), it is copied recursively.
 */
function copyNativeFiles(
  sourceDir: string,
  destDir: string,
  extensions: string[]
) {
  if (!existsSync(sourceDir)) {
    console.warn(`Quantum Metric: source directory not found at ${sourceDir}`);
    return;
  }
  ensureDirSync(destDir);
  const items = readdirSync(sourceDir);
  const files = items.filter((item) => extensions.includes(path.extname(item)));
  files.forEach((item) => {
    const sourcePath = path.join(sourceDir, item);
    const destPath = path.join(destDir, item);
    ensureDirSync(path.dirname(destPath));
    if (statSync(sourcePath).isDirectory()) {
      copySync(sourcePath, destPath);
    } else {
      copyFileSync(sourcePath, destPath);
    }
    console.log(`Copied ${sourcePath} -> ${destPath}`);
  });
  return files;
}

/**
 * iOS – Copy the libQMNative.xcframework folder to the iOS Frameworks directory.
 */
const withQuantumMetricIosLibrary: ConfigPlugin<QuantumMetricPluginProps> = (
  config,
  props
) =>
  withDangerousMod(config, [
    "ios",
    async (config) => {
      const { projectRoot } = config.modRequest;
      const iosDir = path.join(projectRoot, "ios");
      const libraryPath = props.libraryPath || DEFAULT_LIBRARY_PATH;
      const frameworksDir = path.join(iosDir, "Frameworks");
      const sourceDir = path.join(projectRoot, libraryPath);
      // Copy the entire .xcframework folder recursively.
      copyNativeFiles(sourceDir, frameworksDir, [".xcframework"]);
      return config;
    },
  ]);

/**
 * iOS – Add the libQMNative.xcframework reference to the Xcode project.
 *
 * Uses IOSConfig.XcodeUtils helpers to properly add the framework to the project
 * with "Do Not Embed" setting.
 */
const withQuantumMetricIosFramework: ConfigPlugin<QuantumMetricPluginProps> = 
  (config, props) => withXcodeProject(config, (config) => {
  const { projectRoot } = config.modRequest;
  const { projectName } = config.modRequest;
  const libraryPath = props.libraryPath || DEFAULT_LIBRARY_PATH;
  const sourceDir = path.join(projectRoot, libraryPath);
  
  if (existsSync(sourceDir)) {
    // Find items ending with .xcframework (directories)
    const items = readdirSync(sourceDir).filter(
      (item) => path.extname(item) === ".xcframework"
    );
    
    if (items.length > 0) {
      const frameworkFileName = items[0];
      const frameworkName = path.basename(
        frameworkFileName,
        path.extname(frameworkFileName)
      );
      
      const project = config.modResults;
      
      // Check if a file reference for this framework already exists
      const fileReferences = project.pbxFileReferenceSection();
      let alreadyAdded = false;
      
      for (const key in fileReferences) {
        const ref = fileReferences[key];
        if (ref && ref.path && ref.path.includes(frameworkFileName)) {
          alreadyAdded = true;
          break;
        }
      }
      
      if (!alreadyAdded) {
        console.log(`Adding framework ${frameworkName} to Xcode project...`);
        
        // First add the framework file to the Frameworks group
        const frameworkPath = `Frameworks/${frameworkFileName}`;
        
        // Use the provided helper to add the file to the group
        const fileRef = IOSConfig.XcodeUtils.addFileToGroupAndLink({
          filepath: frameworkPath,
          groupName: "Frameworks",
          project,
          verbose: true,
          // Custom function to add the file with "Do Not Embed" setting
          addFileToProject: ({ project, file }) => {
            // Add the file reference to PBX file reference section
            project.addToPbxFileReferenceSection(file);
            
            // Create build file without embedding settings (equivalent to "Do Not Embed")
            project.addToPbxBuildFileSection(file);
            
            // Add to frameworks build phase but NOT to embed frameworks build phase
            const target = project.getFirstTarget();
            if (target) {
              const frameworksBuildPhase = project.pbxFrameworksBuildPhaseObj(target.uuid);
              if (frameworksBuildPhase) {
                project.addToPbxFrameworksBuildPhase(file);
              } else {
                console.warn("Quantum Metric: No Frameworks build phase found in Xcode project.");
              }
            }
          },
        });
        
        console.log(`Added ${frameworkFileName} to frameworks with "Do Not Embed" setting`);
      } else {
        console.log(`Framework ${frameworkName} already exists in Xcode project`);
      }
    }
  }
  
  return config;
});
/**
 * iOS – Ensure OTHER_LDFLAGS contains "-ObjC".
 */
const withQuantumMetricIosLinkerFlags: ConfigPlugin = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection;
    for (const key in configurations) {
      const configuration = configurations[key];
      if (typeof configuration === "object" && configuration.buildSettings) {
        const otherLdFlags =
          configuration.buildSettings["OTHER_LDFLAGS"] || ["$(inherited)"];
        if (!otherLdFlags.includes("-ObjC")) {
          otherLdFlags.push("-ObjC");
          configuration.buildSettings["OTHER_LDFLAGS"] = otherLdFlags;
        }
      }
    }
    return config;
  });

/**
 * iOS – Modify AppDelegate to initialize Quantum Metric SDK.
 *
 * This mod checks whether the AppDelegate is Swift (by file extension)
 * and applies Swift-specific modifications; otherwise, it applies Objective-C modifications.
 * 
 * Following the Quantum Metric SDK integration guide for proper initialization.
 */
const withQuantumMetricIosAppDelegate: ConfigPlugin<QuantumMetricPluginProps> = (config, props) => withAppDelegate(config, (config) => {
  const { subscription, uid, browserName, enableTestMode, disableCrashReporting } = props;
  let appDelegate = config.modResults.contents;
  const isSwift = config.modResults.path && config.modResults.path.endsWith(".swift");
  
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
        initCode += `\n        QMNative.sharedInstance().enableTestConfig(true)`;
      }
      
      // Add initialization to didFinishLaunchingWithOptions
      if (!didFinishRegex.test(appDelegate)) {
        console.warn("Quantum Metric: didFinishLaunchingWithOptions not found in Swift AppDelegate.");
      } else {
        appDelegate = appDelegate.replace(didFinishRegex, `$1${initCode}`);
      }
    }
  } else {
    // Step 2A - Importing for Objective-C
    if (!appDelegate.includes("#import <QMNative/QMNative.h>") &&
        !appDelegate.includes('#import "QMNative.h"')) {
      // For v1.1.71 or higher, use <QMNative/QMNative.h>
      appDelegate = appDelegate.replace(
        /#import "AppDelegate.h"/,
        '#import "AppDelegate.h"\n#import <QMNative/QMNative.h>'
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
 * Android – Copy native .aar files (or folders) to the app/libs folder.
 */
const withQuantumMetricAndroidLibrary: ConfigPlugin<QuantumMetricPluginProps> =
  (config, props) =>
    withDangerousMod(config, [
      "android",
      async (config) => {
        const { projectRoot } = config.modRequest;
        const androidDir = path.join(projectRoot, "android");
        const libraryPath = props.libraryPath || DEFAULT_LIBRARY_PATH;
        const libsDir = path.join(androidDir, "app", "libs");
        const sourceDir = path.join(projectRoot, libraryPath);
        copyNativeFiles(sourceDir, libsDir, [".aar"]);
        return config;
      },
    ]);

/**
 * Android – Modify build.gradle to include the Quantum Metric dependency.
 */
const withQuantumMetricGradle: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    "android",
    async (config) => {
      const { projectRoot } = config.modRequest;
      const gradlePath = path.join(projectRoot, "android", "app", "build.gradle");
      if (existsSync(gradlePath)) {
        let gradleContent = require("fs-extra").readFileSync(gradlePath, "utf8");
        if (!gradleContent.includes("quantum*.aar")) {
          gradleContent = gradleContent.replace(
            /dependencies\s*{/,
            `dependencies {\n    implementation fileTree(dir: 'libs', include: ['quantum*.aar'])`
          );
          require("fs-extra").writeFileSync(gradlePath, gradleContent);
          console.log(`Added Quantum Metric dependency to ${gradlePath}`);
        }
      }
      return config;
    },
  ]);

/**
 * Android – Modify MainApplication (Java/Kotlin) to initialize Quantum Metric SDK.
 */
const withQuantumMetricMainApplication: ConfigPlugin<QuantumMetricPluginProps> =
  (config, props) =>
    withMainApplication(config, (config) => {
      const { subscription, uid, browserName, enableTestMode } = props;
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
          let qmInitCode = `\n    // Initialize Quantum Metric\n    QuantumMetric.initialize("${subscription}", "${uid}", this)`;
          if (browserName) {
            qmInitCode += `.withBrowserName("${browserName}")`;
          }
          if (enableTestMode) {
            qmInitCode += `.enableTestMode()`;
          }
          qmInitCode += `.start()\n`;
          const onCreateRegex = /(super\.onCreate\(\))/;
          mainApplication = mainApplication.replace(onCreateRegex, `$1${qmInitCode}`);
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

/**
 * Main plugin: Apply all modifications for both iOS and Android.
 */
const withQuantumMetric: ConfigPlugin<QuantumMetricPluginProps> = (
  config,
  props
) => {
  if (!props.subscription || !props.uid) {
    throw new Error(
      "Quantum Metric plugin requires both subscription and uid properties"
    );
  }
  config = withQuantumMetricIosLibrary(config, props);
  config = withQuantumMetricIosFramework(config, props);
  config = withQuantumMetricIosLinkerFlags(config);
  config = withQuantumMetricIosAppDelegate(config, props);
  config = withQuantumMetricAndroidLibrary(config, props);
  config = withQuantumMetricGradle(config);
  config = withQuantumMetricMainApplication(config, props);
  return config;
};

let pkg: { name: string; version?: string } = {
  name: "expo-config-plugin-quantum-metric",
  version: "1.0.1"
};
try {
  pkg = require("expo-config-plugin-quantum-metric/package.json");
} catch {
  console.warn("Failed to load package.json for expo-config-plugin-quantum-metric");
}

export default createRunOncePlugin(
  withQuantumMetric,
  pkg.name,
  pkg.version
);
