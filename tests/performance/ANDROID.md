# Android performance collection — NOT TESTED

The SDK's adb executable exists at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`, but `adb devices -l` listed no connected devices. No build was installed or profiled. Do not infer frame performance, memory stability, crash frequency or UI smoothness from Node benchmarks or API results.

Use a physical Android phone with USB debugging enabled, an authorized USB connection, and a release/internal preview build of `com.cebspot.app` configured to use the isolated backend. The repository uses Expo 52 / React Native 0.76, version 1.0.3, new architecture, `preview` EAS internal distribution, and an Expo dev-client development profile. Record the exact build ID, app version, build type, runtime/update identity and source hash; Expo Go/debug results are separate exploratory evidence. Do not install an existing production-configured APK and assume it uses local services.

From PowerShell:

```powershell
$adbTool = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
& $adbTool devices -l
$deviceSerial = '<authorized serial>'
$artifactDir = 'tests/performance/device-artifacts'
New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
& $adbTool -s $deviceSerial shell getprop ro.product.manufacturer
& $adbTool -s $deviceSerial shell getprop ro.product.model
& $adbTool -s $deviceSerial shell getprop ro.build.version.release
& $adbTool -s $deviceSerial shell getprop ro.build.version.sdk
& $adbTool -s $deviceSerial shell wm size
& $adbTool -s $deviceSerial shell dumpsys display > "$artifactDir/display.txt"
& $adbTool -s $deviceSerial shell dumpsys package com.cebspot.app > "$artifactDir/package.txt"
& $adbTool -s $deviceSerial shell dumpsys battery > "$artifactDir/battery-before.txt"
& $adbTool -s $deviceSerial shell dumpsys thermalservice > "$artifactDir/thermal-before.txt"
& $adbTool -s $deviceSerial reverse tcp:54321 tcp:54321
& $adbTool -s $deviceSerial reverse tcp:8000 tcp:8000
& $adbTool -s $deviceSerial logcat -c
& $adbTool -s $deviceSerial shell am force-stop com.cebspot.app
& $adbTool -s $deviceSerial shell am start -W -n com.cebspot.app/.MainActivity > "$artifactDir/startup.txt"
& $adbTool -s $deviceSerial shell dumpsys gfxinfo com.cebspot.app reset
& $adbTool -s $deviceSerial shell dumpsys meminfo com.cebspot.app > "$artifactDir/memory-baseline.txt"
```

The APK must explicitly use loopback test URLs for `adb reverse` to be effective; those commands do not rewrite embedded configuration. Use synthetic fixture media and a synthetic account. Warm up once; keep display refresh rate, network, battery state and thermal conditions stable. Record connection type, battery/charging and other foreground workloads.

Repeat each interaction ten times, recording timestamps and visible stalls:

1. Pan/zoom the map and select an existing spot marker, with previously cached map tiles where possible. Use normal manual interactions, not an external tile-request flood.
2. Scroll the spot-card carousel through at least 20 entries, reverse direction and repeat. Include list-to-map selection synchronization.
3. Open a spot, view both fixture photos, close it and return to the list. Video viewing/selection is a separate run.
4. Navigate Explore → spot → reservation/checkout → back → saved/profile. Use the isolated backend and do not open real payment checkouts.

After each interaction group, save `gfxinfo` and `meminfo`, then reset frame statistics before the next group:

```powershell
& $adbTool -s $deviceSerial shell dumpsys gfxinfo com.cebspot.app framestats > "$artifactDir/map-frames.txt"
& $adbTool -s $deviceSerial shell dumpsys meminfo com.cebspot.app > "$artifactDir/memory-after-map.txt"
& $adbTool -s $deviceSerial shell dumpsys gfxinfo com.cebspot.app reset
# Repeat with unique filenames for scrolling, photos and navigation.
& $adbTool -s $deviceSerial logcat -d -b crash > "$artifactDir/crashes.txt"
& $adbTool -s $deviceSerial shell dumpsys activity lastanr > "$artifactDir/last-anr.txt"
& $adbTool -s $deviceSerial shell dumpsys battery > "$artifactDir/battery-after.txt"
& $adbTool -s $deviceSerial shell dumpsys thermalservice > "$artifactDir/thermal-after.txt"
```

Check for crashes, ANRs, visible freezes and process restarts. Compare PSS/native/Java allocations before, after ten repetitions, and after 60 idle seconds. Rising retained memory suggests investigation; it alone does not prove a leak. Report rendered-frame count, janky-frame proportion and frame-time median/p95/p99 against the device's actual refresh budget (16.67 ms at 60 Hz, 11.11 ms at 90 Hz, 8.33 ms at 120 Hz). No numerical Android pass target existed in the repository; label any adopted frame target provisional.

For deeper attribution, use Android Studio **Profiler → System Trace** with FrameTimeline, scheduling, CPU and memory data. Record a 60-second trace containing the interaction sequence; add app heap/allocation collection only with a profileable/debuggable build and clearly label that build. `gfxinfo` can omit React Native/WebView/map composition work; the app uses a Leaflet map in WebView, so corroborate with system composition and main/JS thread timing. A release build that disallows detailed app profiling can still provide `dumpsys`/system-trace evidence.

Export sanitized aggregate findings to `evidence/android-summary.json` and update the assessment with device/build details and actual observations. Keep raw traces, screenshots and logcat private: they may include account/device identifiers. Remove reverse mappings created for testing:

```powershell
& $adbTool -s $deviceSerial reverse --remove tcp:54321
& $adbTool -s $deviceSerial reverse --remove tcp:8000
```
