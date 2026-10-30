#!/usr/bin/env bash
# Monta o APK sem Gradle, só com as ferramentas do SDK (aapt2, javac, d8 ou dx, zipalign, apksigner).
# Útil onde o Android Gradle Plugin não está disponível. Com o Android Studio/Gradle, use ./gradlew assembleRelease.
#
#   ANDROID_SDK=/usr/lib/android-sdk tools/build-apk.sh        -> build/minecoin.apk
#
# Variáveis: ANDROID_SDK (padrão /usr/lib/android-sdk), PLATFORM (android-NN; padrão a mais nova instalada),
# KEYSTORE/KS_PASS/KEY_ALIAS (padrão: a chave de debug em ~/.android/debug.keystore, criada se faltar).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK:-${ANDROID_HOME:-/usr/lib/android-sdk}}"
PLATFORM="${PLATFORM:-$(ls "$SDK/platforms" | sort -V | tail -1)}"
ANDROID_JAR="$SDK/platforms/$PLATFORM/android.jar"
BT="$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)"
tool() { if [ -x "$BT/$1" ]; then echo "$BT/$1"; else command -v "$1"; fi; }
AAPT2="$(tool aapt2)"; ZIPALIGN="$(tool zipalign)"; APKSIGNER="$(tool apksigner)"

VERSION_NAME="$(sed -n 's/^minecoinVersion=//p' "$ROOT/gradle.properties")"
VERSION_CODE="$(sed -n 's/^minecoinVersionCode=//p' "$ROOT/gradle.properties")"
PKG=app.minecoin
MAIN="$ROOT/app/src/main"
OUT="$ROOT/build/apk"
rm -rf "$OUT" && mkdir -p "$OUT/res" "$OUT/classes" "$OUT/gen"

echo "SDK: $SDK  plataforma: $PLATFORM  build-tools: $BT"

# o manifesto do Gradle não tem package (vem do namespace): coloca-o para o aapt2
sed "s|<manifest |<manifest package=\"$PKG\" |" "$MAIN/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"

"$AAPT2" compile --dir "$MAIN/res" -o "$OUT/res/res.zip"
"$AAPT2" link -o "$OUT/unsigned.apk" -I "$ANDROID_JAR" --manifest "$OUT/AndroidManifest.xml" \
  --java "$OUT/gen" -A "$MAIN/assets" -0 ogg \
  --min-sdk-version 21 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  "$OUT/res/res.zip"

javac -nowarn -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" -encoding UTF-8 \
  -d "$OUT/classes" $(find "$MAIN/java" "$OUT/gen" -name '*.java') 2>&1 | grep -v 'warning: \[options\]' || true
[ -n "$(find "$OUT/classes" -name '*.class')" ] || { echo 'javac falhou'; exit 1; }

if [ -x "$(tool d8 || true)" ] && [ -n "$(tool d8 || true)" ]; then
  "$(tool d8)" --min-api 21 --lib "$ANDROID_JAR" --output "$OUT" $(find "$OUT/classes" -name '*.class')
else
  DX="$(tool dx || command -v dalvik-exchange)"
  "$DX" --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/classes"
fi

(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
"$ZIPALIGN" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

KEYSTORE="${KEYSTORE:-$HOME/.android/debug.keystore}"
KS_PASS="${KS_PASS:-android}"
KEY_ALIAS="${KEY_ALIAS:-androiddebugkey}"
if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi
mkdir -p "$ROOT/build"
"$APKSIGNER" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias "$KEY_ALIAS" \
  --out "$ROOT/build/minecoin.apk" "$OUT/aligned.apk"
"$APKSIGNER" verify "$ROOT/build/minecoin.apk"
echo "APK: $ROOT/build/minecoin.apk ($(du -h "$ROOT/build/minecoin.apk" | cut -f1))"
