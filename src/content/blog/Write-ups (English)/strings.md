# Strings - Write Up

> [!NOTE] 
> `Challenge:` [Strings](https://www.mobilehackinglab.com/course/lab-strings).
> `Device:` [redroid/redroid:13.0.0-latest](https://github.com/remote-android/redroid-doc).
> `Tools:` adb, frida, jadx, rizin.

---
## Overview

After installing the apk, we'll unzip it to get a general overview of its structure:

```bash
❯ mkdir decompiled

❯ unzip com.mobilehackinglab.strings.apk -d decompiled

❯ ls decompiled/
 AndroidManifest.xml  classes4.dex       META-INF
 classes.dex          DebugProbesKt.bin  res
 classes2.dex         kotlin             resources.arsc
 classes3.dex         lib                
```

Keep this directory in your workspace, as we'll use it later. Next, we'll open the application in our device:
<div style="display: flex; justify-content: center; margin: 20px auto; max-width: 800px; align-items: center;">
  <div style="flex: 0 0 180px; margin-right: 25px;">
    <img src="/images/Write-ups/strings/app-init.png" style="width: 100%; height: auto; max-width: 180px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
    <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555; font-size: 12px;">
      Figure 1: App initialization
    </p>
  </div>

  <div style="flex: 1; text-align: justify; padding-right: 5%;">
    <p style="margin-left: 15px; line-height: 1.5;">As we can see, the application is indicating that it's using native code (Hello from C++). With this in mind, we'll see two native libraries in <code>decompiled/lib/x86_64</code>, <strong>libchallenge.so</strong> and <strong>libflag.so</strong>, those are ELF shared objects that can be analyzed using some decompiler, in our case, <strong>Rizin</strong>.</p>
    <p style="margin-left: 15px; line-height: 1.5;">However, we'll first see the application classes using jadx, this with the goal of understanding the application behavior.</p>
  </div>
</div>
```bash
❯ jadx-gui com.mobilehackinglab.strings.apk &
```
<div align="center" style="margin: 20px 0;">
  <img src="/images/Write-ups/strings/jadx-manifest.png" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
  <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555;">
    Figure 2: AndroidManifest.xml analysis in jadx
  </p>
</div>
In the Android manifest we see two activities, `MainActivity` and `Activity2`, both can be exported, which means we could **launch** the activity. First, we'll see the `MainActivity` (**Navigation > Go to main Activity**):
<div align="center" style="margin: 20px 0;">
  <img src="/images/Write-ups/strings/jadx-main.png" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
  <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555;">
    Figure 2: MainActivity analysis in jadx
  </p>
</div>
There is a behavior easy to understand, the app simply loads **libchallenge.so** library, then, use a native function called `stringFromJNI` and show its result. Let's see this function using **Rizin**:

```bash
❯ ls decompiled/lib/
 arm64-v8a/  armeabi-v7a/  x86/  x86_64/
 
❯ ls decompiled/lib/x86_64 # I choose x86_64 just for convenience

❯ ls decompiled/lib/x86_64/
  libchallenge.so  libflag.so
  
❯ rizin -c "aa;afl~stringFromJNI" decompiled/lib/x86_64/libchallenge.so
[x] Analyze all flags starting with sym. and entry0 (aa)
0x00020490    4 163  -> 133  sym.Java_com_mobilehackinglab_challenge_MainActivity_stringFromJNI
```

`rizin -c` executes a rizin shell with the given commands, in this case, I used `aa` for doing a basic analysis and `afl~stringFromJNI` for list all functions of the ELF and filter (`~`) for those that contains `stringFromJNI`. We can see a symbol called `Java_..._stringFromJNI`, let's print its code with `pdg @ 0x00020490` (rz-ghidra plugin is required):

```c
undefined8 sym.Java_com_mobilehackinglab_challenge_MainActivity_stringFromJNI(int64_t arg1, int64_t arg2)
{
    undefined8 uVar1;
    int64_t in_FS_OFFSET;
    int64_t var_60h;
    int64_t var_58h;
    int64_t var_50h;
    int64_t var_38h;
    int64_t var_30h;
    int64_t var_28h;
    int64_t var_10h;
    
    var_10h = *(int64_t *)(in_FS_OFFSET + 0x28);
    fcn.00043a80(&var_28h, "Hello from C++");
    uVar1 = fcn.000205e0((int64_t)&var_28h);
    uVar1 = fcn.00043a90(arg1, uVar1);
    fcn.00043aa0(&var_28h);
    if (*(int64_t *)(in_FS_OFFSET + 0x28) == var_10h) {
        return uVar1;
    }
    // WARNING: Subroutine does not return
    sym.imp.__stack_chk_fail();
}
```

Apparently, this function print "Hello from C++", that is the string we see on the app. However, we don't see a reference to `Activity2` in the main activity, therefore, we'll see its behavior and check if its useful.

---
## Starting an activity

Clicking `com.mobilehackinglab.challenge.Activity2` in the Android manifest, jadx will redirect us to `Activity2` class:
<div align="center" style="margin: 20px 0;">
  <img src="/images/Write-ups/strings/jadx-activity2.png" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
  <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555;">
    Figure 3: Activity2 analysis in jadx
  </p>
</div>
This activity load **libflag.so** and call a native function called `getflag` as long as some conditions were met. The first two conditions, ``isActionView`` and `isU1Matching`, the first one verify if the activity is called with the `VIEW` action intent, the second one verify an special shared preference. The latter doesn't matter, cause we could hook `Intrinsics.areEqual` with **Frida** to always return true.

```js
Java.perform(() => {
  const Intrinsics = Java.use("kotlin.jvm.internal.Intrinsics");
  Intrinsics.areEqual.overload("java.lang.Object", "java.lang.Object").implementation = (obj1, obj2) => {
    return true;
  }
});
```

With these conditions met, we confront a new problem, an special **URI** is required, where the scheme must be "mhl", the host "lab" and the last path segment is a **base64** value; the latter can be easily reversed cause we got the algorithm that creates it.

```java
String ds = new String(decodedValue, Charsets.UTF_8);  
                    byte[] bytes = "your_secret_key_1234567890123456".getBytes(Charsets.UTF_8);  
                    Intrinsics.checkNotNullExpressionValue(bytes, "this as java.lang.String).getBytes(charset)");  
                    String str = decrypt("AES/CBC/PKCS5Padding", "bqGrDKdQ8zo26HflRsGvVA==", new SecretKeySpec(bytes, "AES"));
```

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
import base64

key = b"your_secret_key_1234567890123456"
iv = b"1234567890123456"
ciphertext = base64.b64decode("bqGrDKdQ8zo26HflRsGvVA==")

cipher = AES.new(key, AES.MODE_CBC, iv)
text = unpad(cipher.decrypt(ciphertext), AES.block_size)
print(text.decode('utf-8'))
```

```bash
❯ python3 decrypt.py
mhl_secret_1337

❯ echo -n "mhl_secret_1337" | base64
bWhsX3NlY3JldF8xMzM3
```

Given all this, we can construct the **URI**: `mhl://labs/bWhsX3NlY3JldF8xMzM3`. Next, in order to get the flag, we need to run the previous Frida hook and start the activity with the **URI** using adb.

```bash
❯ frida -U -n Strings -l hook.js
     ____
    / _  |   Frida 17.2.11 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to redroid13 x86 64 (id=localhost:5555)
Attaching...                                                                                                                             
[redroid13 x86 64::Strings ]->
```

```bash
# In other terminal
❯ adb -s localhost:5555 shell am start -d "mhl://labs/bWhsX3NlY3JldF8xMzM3" com.mobilehackinglab.challenge/com.mobilehackinglab.challenge.Activity2

Starting: Intent { act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] dat=mhl://labs/... cmp=com.mobilehackinglab.challenge/.Activity2 }
```
<div style="display: flex; justify-content: center; margin: 20px auto; max-width: 800px; align-items: center;">
  <div style="flex: 1; text-align: justify; padding-right: 5%;">
    <p style="margin-left: 15px; line-height: 1.5;">It's doing well, the application is showing us the string returned by <code>getflag</code> function, which is "success". Apparently, <code>getflag</code> doesn't return the flag. Let's see the challenge hints.</p>
    <p style="margin-left: 15px; line-height: 1.5;">One of these says the following: "- Utilize Frida for tracing or employ Frida's memory scanning.", this suggest that something is dynamically allocated in memory.</p>
  </div>
  
  <div style="flex: 0 0 180px; margin-right: 25px;">
    <img src="/images/Write-ups/strings/app-activity2.png" style="width: 100%; height: auto; max-width: 180px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
    <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555; font-size: 12px;">
      Figure 4: Executing activity2
    </p>
  </div>
</div>
## Scanning memory with Frida

We need to modify our Frida script in order to look for patterns in the application memory space, but first, we'll hook `getflag` native function:

```bash
✦ ❯ rizin -c "aa;afl~getflag" decompiled/lib/x86_64/libflag.so
[x] Analyze all flags starting with sym. and entry0 (aa)
0x00001aa0    1 248          sym.Java_com_mobilehackinglab_challenge_Activity2_getflag
```

```js
Java.perform(() => {
  const Intrinsics = Java.use("kotlin.jvm.internal.Intrinsics");
  Intrinsics.areEqual.overload("java.lang.Object", "java.lang.Object").implementation = (obj1, obj2) => {
    return true;
  }

  const lib = Process.getModuleByName('libflag.so');
  const flagImpl = lib.getExportByName('Java_com_mobilehackinglab_challenge_Activity2_getflag');
  Interceptor.attach(flagImpl, {
    onLeave: function () {
       // ...
    }
  });
});
```

With `getflag` hooked, we need to implement a function capable of scan the application memory, looking for the flag pattern "`MHL{`", which is referenced in the challenge hints. To do this, we need to use a method called `scan` in Frida's memory module. `scan` receives four arguments: `Memory.scan(address, size, pattern, callbacks)` (see Frida's [documentation](https://frida.re/docs/javascript-api/)).

`address` and `size` correspond to the module's base address and size, respectively, in this case, the module which we're interested is **libflag.so** cause `Activity2`'s behavior revolves around the latter. The pattern must be in hexadecimal format and separated by spaces. With all of this in mind, we can implement the function:

```js
function scanMemory(module, pattern) {
  Memory.scan(module.base, module.size, pattern, {
    onMatch(addr, size) {
      console.log("\n[*] Match!");
      console.log("[*] Addr: " + addr + ", Size: " + size);
      console.log("[*] String: " + ptr(addr).readCString());
    },
    onError(reason) {
      console.log("[!] Error: " + reason);
    },
    onComplete() {
      console.log("[*] Complete!");
    },
  });
}
```

If the scanner finds the pattern, the `onMatch` callback is triggered. It contains the address and the size of the pattern that was matched. In order to print it we need to convert the address to a pointer, then, we can use the method `readCString`, that starts reading from its pointer and stops when it finds a null terminator. We'll call this function in our `getflag` hook:

```js
onLeave: function () {
    const pattern = '4d 48 4c 7b'; // "MHL{"
    scanMemory(lib, pattern);
}
```

```bash
❯ frida -U -n Strings -l hook.js
     ____
    / _  |   Frida 17.2.11 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to redroid13 x86 64 (id=localhost:5555)
Attaching...                                                                                                                             
[redroid13 x86 64::Strings ]->
```

```bash
# In other terminal
❯ adb -s localhost:5555 shell am start -d "mhl://labs/bWhsX3NlY3JldF8xMzM3" com.mobilehackinglab.challenge/com.mobilehackinglab.challenge.Activity2

Starting: Intent { act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] dat=mhl://labs/... cmp=com.mobilehackinglab.challenge/.Activity2 }
```

```bash
[redroid13 x86 64::Strings ]->
[*] Match!
[*] Addr: 0x707d63e61fc0
[*] String: MHL{IN_THE_MEMORY}
[*] Complete!
```

That's all, thanks for reading :).
