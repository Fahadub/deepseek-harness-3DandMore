# Quick Start — DeepSeek Harness 3D

## العربية

### متطلبات
- Windows 10/11
- Node.js 22+ — من [nodejs.org](https://nodejs.org)
- pnpm — افتح CMD واكتب: `npm install -g pnpm`

### التشغيل (أمر واحد)
انسخ السطر كاملاً والصقه في CMD:
```
powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; if(!(Get-Command node -ErrorAction SilentlyContinue)){Invoke-WebRequest 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile $env:TEMP\node.msi; Start-Process msiexec.exe -ArgumentList '/i',$env:TEMP\node.msi,'/qn','/norestart' -Wait}; $env:Path=[System.Environment]::GetEnvironmentVariable('Path','Machine'); npm install -g pnpm; cd $env:USERPROFILE\Desktop; git clone https://github.com/Fahadub/deepseek-harness-3DandMore.git; cd deepseek-harness-3DandMore; pnpm install; powershell -File tools-suite\download-godot.ps1; powershell -File tools-suite\download-blender.ps1; powershell -File tools-suite\make-cordis.ps1; pnpm dsh web --patch tools-suite\cordis-runtime.yml"
```

### أو خطوة بخطوة
1. حمّل المشروع (Clone or Download ZIP)
2. انقر مرتين على `START.bat` — يفعل كل شيء تلقائياً:
   - يثبّت المكتبات (`pnpm install`)
   - ينزّل Godot 4.7.2 (~180MB)
   - ينزّل Blender 4.5 LTS (~350MB)
   - يشغّل الخادم على المنفذ 3060
   - يفتح المتصفح تلقائياً
3. أول تشغيل: 5-10 دقائق (تنزيل المحركات) — بعدها ثوانٍ

### الواجهات
| الصفحة | الرابط |
|---|---|
| الواجهة الرئيسة | http://127.0.0.1:3060 |
| مركز الأدوات | http://127.0.0.1:3060/tools |
| استوديو JS | http://127.0.0.1:3060/tools/studio |
| استوديو Godot | http://127.0.0.1:3060/tools/godot |

### حل المشاكل
| المشكلة | الحل |
|---|---|
| Godot/Blender ما ظهر | START.bat ينزّلها تلقائياً — تأكد من الإنترنت وأعد المحاولة |
| الصفحة بيضاء | انتظر 30-40 ثانية (أول تشغيل فقط) |
| Port in use | أغلق أي نسخة سابقة وأعد START.bat |
| pnpm not found | `npm install -g pnpm` ثم أغلق CMD وافتحه من جديد |

---

## English

### Requirements
- Windows 10/11
- Node.js 22+ — from [nodejs.org](https://nodejs.org)
- pnpm — open CMD and run: `npm install -g pnpm`

### Run (one command)
Copy the entire line and paste it in CMD:
```
powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; if(!(Get-Command node -ErrorAction SilentlyContinue)){Invoke-WebRequest 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile $env:TEMP\node.msi; Start-Process msiexec.exe -ArgumentList '/i',$env:TEMP\node.msi,'/qn','/norestart' -Wait}; $env:Path=[System.Environment]::GetEnvironmentVariable('Path','Machine'); npm install -g pnpm; cd $env:USERPROFILE\Desktop; git clone https://github.com/Fahadub/deepseek-harness-3DandMore.git; cd deepseek-harness-3DandMore; pnpm install; powershell -File tools-suite\download-godot.ps1; powershell -File tools-suite\download-blender.ps1; powershell -File tools-suite\make-cordis.ps1; pnpm dsh web --patch tools-suite\cordis-runtime.yml"
```

### Or step by step
1. Clone or Download ZIP
2. Double-click `START.bat` — it automatically:
   - Installs dependencies (`pnpm install`)
   - Downloads Godot 4.7.2 (~180MB)
   - Downloads Blender 4.5 LTS (~350MB)
   - Starts the server on port 3060
   - Opens your browser automatically
3. First run: 5-10 minutes (engine downloads) — subsequent runs: seconds

### Pages
| Page | URL |
|---|---|
| Main UI | http://127.0.0.1:3060 |
| Tools Hub | http://127.0.0.1:3060/tools |
| JS Studio | http://127.0.0.1:3060/tools/studio |
| Godot Studio | http://127.0.0.1:3060/tools/godot |

### Troubleshooting
| Issue | Fix |
|---|---|
| Godot/Blender missing | START.bat downloads them automatically — check internet and retry |
| Blank page | Wait 30-40 seconds (first run only) |
| Port in use | Close any previous instance and re-run START.bat |
| pnpm not found | `npm install -g pnpm` then restart CMD |

---

## 中文

### 系统要求
- Windows 10/11
- Node.js 22+ — 从 [nodejs.org](https://nodejs.org) 下载
- pnpm — 打开 CMD 运行：`npm install -g pnpm`

### 一键运行
将整行复制粘贴到 CMD：
```
powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; if(!(Get-Command node -ErrorAction SilentlyContinue)){Invoke-WebRequest 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile $env:TEMP\node.msi; Start-Process msiexec.exe -ArgumentList '/i',$env:TEMP\node.msi,'/qn','/norestart' -Wait}; $env:Path=[System.Environment]::GetEnvironmentVariable('Path','Machine'); npm install -g pnpm; cd $env:USERPROFILE\Desktop; git clone https://github.com/Fahadub/deepseek-harness-3DandMore.git; cd deepseek-harness-3DandMore; pnpm install; powershell -File tools-suite\download-godot.ps1; powershell -File tools-suite\download-blender.ps1; powershell -File tools-suite\make-cordis.ps1; pnpm dsh web --patch tools-suite\cordis-runtime.yml"
```

### 或分步操作
1. 克隆或下载 ZIP
2. 双击 `START.bat` — 自动完成：
   - 安装依赖（`pnpm install`）
   - 下载 Godot 4.7.2（约 180MB）
   - 下载 Blender 4.5 LTS（约 350MB）
   - 在端口 3060 启动服务器
   - 自动打开浏览器
3. 首次运行：5-10 分钟（下载引擎）— 之后秒开

### 页面
| 页面 | 地址 |
|---|---|
| 主界面 | http://127.0.0.1:3060 |
| 工具中心 | http://127.0.0.1:3060/tools |
| JS 工作室 | http://127.0.0.1:3060/tools/studio |
| Godot 工作室 | http://127.0.0.1:3060/tools/godot |

### 常见问题
| 问题 | 解决 |
|---|---|
| Godot/Blender 未出现 | START.bat 会自动下载 — 检查网络后重试 |
| 页面空白 | 等待 30-40 秒（仅首次） |
| 端口被占用 | 关闭之前的实例再运行 START.bat |
| 找不到 pnpm | 运行 `npm install -g pnpm` 后重启 CMD |
