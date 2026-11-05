# THE LAST SIGNAL (v1)

## اجرا
    pip install -r requirements.txt
    python main.py

## ساخت exe
    pyinstaller --noconfirm --onedir --name TheLastSignal --add-data "web;web" --collect-all nicegui main.py

## هدف نسخه ۱
کلید قرمز را در اتاق وسط پیدا کن، در قفل‌شده را باز کن و به نقطه سبز برس.

## نسخه ۳
سه مرحله: ورود (کلید)، راهروها (فیوز و جعبه فیوز)، زیرزمین (کلید + فیوز). سطوح در web/levels.js تعریف می‌شوند.

## نسخه ۴
- در هر یک از سه مرحله یک کمد مخفی اضافه شده است.
- نزدیک کمد، کلید `E` را بزن تا پنهان شوی؛ دوباره `E` را بزن تا بیرون بیایی.
- هنگام مخفی بودن، دشمن نمی‌تواند تو را ببیند یا بکشد و پس از کمی مکث تعقیب را رها می‌کند.
- مخفیگاه‌ها با نماد `H` در `web/levels.js` مشخص می‌شوند.


## نسخه ۵
- چراغ‌قوه با باتری محدود: روشن بودن باتری را مصرف می‌کند و خاموش بودن آن آهسته شارژ می‌شود. کلید F برای روشن/خاموش کردن است.
- دشمن صدای قدم‌ها، دویدن، باز شدن درها و تعامل با اشیا را می‌شنود و به محل صدا می‌رود.
- دشمن در حالت بررسی (investigate) مسیر آخرین صدا را جست‌وجو می‌کند و در صورت دیدن بازیکن تعقیب را آغاز می‌کند.
- HUD باتری به رابط کاربری اضافه شده است.


## نسخه ۷
- پنج مرحله، شامل آرشیو و اتاق سیگنال
- سیستم سلامتی سه‌مرحله‌ای و جعبه کمک‌های اولیه (E)
- دشمن می‌تواند مخفیگاه نزدیک را جست‌وجو کند
- رویدادهای ترسناک تصادفی و لرزش چراغ‌قوه
- پایان حقیقت با جمع‌آوری پنج یادداشت

## نسخه ۸: وب + نصب روی دستگاه
این نسخه را می‌توان هم روی سایت اجرا کرد و هم به شکل برنامه نصب کرد.

### اجرای مستقیم در مرورگر / میزبانی سایت
- محتوای پوشه `web/` را روی هاست دارای HTTPS قرار دهید.
- برای لینک مستقیم بازی: `https://YOUR-DOMAIN/game.html`
- برای قرار دادن بازی داخل صفحه سایت: از `embed.html` استفاده کنید یا iframe زیر را در صفحه سایت قرار دهید:
```html
<iframe src="/games/the-last-signal/game.html" style="width:100%;height:80vh;border:0" allow="fullscreen; autoplay" allowfullscreen></iframe>
```
- بهتر است مسیر بازی روی همان دامنه سایت باشد. اگر از دامنه جدا استفاده می‌کنید، تنظیمات CSP/X-Frame-Options هاست نباید iframe را مسدود کند.
- PWA برای نصب از مرورگر به HTTPS (یا localhost) نیاز دارد. پس از باز کردن بازی در مرورگر سازگار، گزینه نصب یا منوی مرورگر را انتخاب کنید. فایل `sw.js` منابع اصلی را برای اجرای آفلاین cache می‌کند.

### برنامه دسکتاپ
- ویندوز: `build_windows.bat` را اجرا کنید؛ خروجی در `dist/TheLastSignal/` ساخته می‌شود.
- Linux: `chmod +x build_linux.sh && ./build_linux.sh`
- این اسکریپت‌ها بسته‌بندی برنامه NiceGUI موجود را انجام می‌دهند؛ خروجی exe مستقل نیست و پوشه خروجی کامل را باید همراه برنامه توزیع کرد.

### نکته
بازی داخل مرورگر با WebGL اجرا می‌شود؛ کاربر برای بازی وب نیازی به نصب ندارد. نصب PWA/برنامه دسکتاپ اختیاری است.


Patch 1: quieter audio, reduced fog, more open map connections, improved hiding cabinet blackout, and persistent enemy patrol/search/chase behavior.

## v9
- هوش مصنوعی: پیش‌بینی مسیر حرکت بازیکن، حافظه آخرین موقعیت، جستجوی منطقه، دید بیشتر وقتی چراغ‌قوه روشن است، سرعت تعقیب که با گذر زمان بالا می‌رود.
- حرکت روان: شتاب‌گیری، چرخش نرم، میان‌بُر زدن در مسیر، گام‌برداری هماهنگ با سرعت.
- اسکین ترسناک: دست‌های بلند با ناخن، فک آویزان، دندان، موی بلند، دنده و ستون فقرات بیرون‌زده.
- جامپ‌اسکیر: چهره ناگهان در صورت می‌پرد و می‌رود؛ دشمن چند قدم نزدیک می‌شود و ناگهان غیب می‌شود.


## Patch 9 – Real-file jumpscare audio
The jumpscare layers two CC0 sound-file assets from SFXMint:
- Distant Female Scream 01: https://sfxmint.com/sounds/female-scream-01 (CC0 1.0)
- Jump-Scare Burst Horror Stinger Hit 75: https://sfxmint.com/sounds/horror-stinger-75 (CC0 1.0)

These are loaded as audio files at runtime. Internet access is required for the external audio files; the original synthesized jumpscare remains as a fallback if playback is blocked or the files cannot load.
