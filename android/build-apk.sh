#!/usr/bin/env bash
# Build a small signed testing APK with the official Android SDK; no Gradle download required.
set -euo pipefail
cd "$(dirname "$0")"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [[ -z "$sdk" ]]; then echo 'Set ANDROID_SDK_ROOT to your Android SDK directory.' >&2; exit 1; fi
tools="$sdk/build-tools/35.0.0"
platform="$sdk/platforms/android-35/android.jar"
for tool in aapt2 d8 zipalign apksigner; do
  [[ -x "$tools/$tool" ]] || { echo "Missing $tools/$tool. Install build-tools;35.0.0." >&2; exit 1; }
done
[[ -f "$platform" ]] || { echo 'Install platforms;android-35.' >&2; exit 1; }
build=app/build/manual
mkdir -p "$build/classes" "$build/dex" dist
rm -rf "$build/classes" "$build/dex"
mkdir -p "$build/classes" "$build/dex"
"$tools/aapt2" compile --dir app/src/main/res -o "$build/resources.zip"
"$tools/aapt2" link -o "$build/base.apk" -I "$platform" --manifest app/src/main/AndroidManifest.xml \
  -A app/src/main/assets --version-code 11 --version-name 1.2.4 "$build/resources.zip"
find app/src/main/java -name '*.java' -print > "$build/sources.txt"
if command -v javac >/dev/null; then compiler=(javac); else compiler=(java -m jdk.compiler/com.sun.tools.javac.Main); fi
"${compiler[@]}" -encoding UTF-8 --release 8 -classpath "$platform" -d "$build/classes" @"$build/sources.txt"
find "$build/classes" -name '*.class' -print > "$build/classes.txt"
"$tools/d8" --lib "$platform" --min-api 26 --output "$build/dex" @"$build/classes.txt"
cp "$build/base.apk" "$build/unsigned.apk"
(cd "$build/dex" && zip -q ../unsigned.apk classes*.dex)
"$tools/zipalign" -f 4 "$build/unsigned.apk" "$build/aligned.apk"
# Keep the signing key OUTSIDE the repository. Reuse it to install updates without uninstalling.
keystore="${MASDUENOS_DEBUG_KEYSTORE:-$HOME/.android/masduenos-salon-debug.keystore}"
mkdir -p "$(dirname "$keystore")"
if [[ ! -f "$keystore" ]]; then
  keytool -genkeypair -keystore "$keystore" -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Mas Duenos Testing,O=Laind,C=AR' >/dev/null
fi
"$tools/apksigner" sign --ks "$keystore" --ks-key-alias androiddebugkey --ks-pass pass:android \
  --key-pass pass:android --out dist/masduenos-salon-1.2.4.apk "$build/aligned.apk"
"$tools/apksigner" verify --verbose dist/masduenos-salon-1.2.4.apk
echo 'APK: android/dist/masduenos-salon-1.2.4.apk'
