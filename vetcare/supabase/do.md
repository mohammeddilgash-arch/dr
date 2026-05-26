# VetCare Supabase - Full Execution Checklist

هذا الملف هو قائمة التنفيذ الكاملة داخل Supabase لمشروع VetCare.
نفّذ الخطوات بالترتيب.

---

> **Project ID:** `jlsqirpmozthuodjbdrj`
> **Supabase Dashboard:** https://supabase.com/dashboard/project/jlsqirpmozthuodjbdrj
> **رابط Vercel الحالي:** https://vetcare-fymoxd5py-mohammeddilgash-archs-projects.vercel.app

---

## 0) قبل البدء

تأكد أنك تملك:
- Project جديد أو جاهز في Supabase.
- صلاحية الوصول إلى:
  - SQL Editor
  - Authentication
  - Edge Functions
  - Project Settings > API

روابط الموقع الحالية على Vercel:
- **الرئيسي:** https://vetcare-fymoxd5py-mohammeddilgash-archs-projects.vercel.app
- https://vetcare-weld.vercel.app (إن كان موجوداً)

## 1) تنفيذ مخطط قاعدة البيانات (SQL)

افتح Supabase > SQL Editor > New Query ثم نفّذ كامل محتوى الملف:
- supabase/schema.sql

ملاحظة:
- هذا ينشئ الجداول، الدوال، RLS policies، والقيم الابتدائية في site_settings.

## 2) إعداد Authentication URLs — 🔴 إصلاح مشكلة Redirect إلى localhost

### المشكلة المُبلَّغة
رابط إعادة تعيين كلمة المرور يُوجَّه إلى `http://localhost` بدلاً من رابط Vercel.

### الحل (Authentication > URL Configuration)

اضبط **Site URL** على:
```
https://vetcare-fymoxd5py-mohammeddilgash-archs-projects.vercel.app
```

أضف في **Additional Redirect URLs** (كل رابط في سطر):
```
https://vetcare-fymoxd5py-mohammeddilgash-archs-projects.vercel.app/**
https://vetcare-weld.vercel.app/**
https://*.vercel.app/**
http://localhost:3000/**
http://localhost:8000/**
http://127.0.0.1:8000/**
```

> ملاحظة مهمة: روابط `localhost` مفيدة للتطوير فقط — يمكن حذفها لاحقاً في بيئة الإنتاج الكاملة.

### سبب المشكلة
Supabase يبني رابط Reset Password بناءً على **Site URL**. إذا كانت Site URL تشير إلى localhost (أو فارغة)، يذهب الرابط إلى localhost.

## 3) إنشاء أول مستخدم Admin في Auth

افتح:
- Authentication > Users > Add user

أنشئ مستخدم بريد + كلمة مرور (هذا سيكون الأدمن الأول).

بعد الإنشاء، انسخ user id (UUID) الخاص به.

## 4) إعطاء هذا المستخدم دور super_admin

افتح SQL Editor ونفّذ (استبدل UUID):

```sql
insert into public.admin_profiles (user_id, role)
values ('PUT_REAL_USER_UUID_HERE', 'super_admin')
on conflict (user_id) do nothing;
```

مهم جدًا:
- role يجب أن تكون بنص مفرد هكذا: 'super_admin'
- لا تستخدم "super_admin" لأن ذلك يكسر check constraint.

## 5) التحقق من API Credentials للمشروع

افتح:
- Project Settings > API

انسخ:
- Project URL
- anon public key

ثم تأكد أن الملف المحلي مطابق:
- supabase-config.js

ويكون بالشكل:

```js
window.VETCARE_SUPABASE = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
  functionsBaseUrl: "https://YOUR_PROJECT_ID.supabase.co/functions/v1"
};
```

## 6) نشر Edge Functions

الوظائف الثلاث الموجودة في `supabase/edge-functions/`:

| Function | المهمة |
|----------|--------|
| `appointments-status` | قبول/رفض المواعيد + إرسال إيميل للمريض عبر Resend |
| `invite-admin` | إنشاء أدمن جديد (super admin فقط) |
| `contact-message-notify` | إشعار الأدمن بريدياً عند استلام رسالة تواصل |

### خيار A (Supabase CLI) — موصى به
من جذر المشروع نفّذ:

```bash
supabase login
supabase link --project-ref jlsqirpmozthuodjbdrj
supabase functions deploy appointments-status
supabase functions deploy invite-admin
supabase functions deploy contact-message-notify
```

### خيار B (Dashboard)
- افتح **Edge Functions** في Dashboard.
- أنشئ كل Function بنفس الاسم المذكور أعلاه.
- الصق محتوى ملف `index.ts` الخاص بها.
- اضغط Deploy.

## 7) إعداد Secrets للـ Edge Functions

افتح:
- **Project Settings > Edge Functions > Secrets**

أو عبر CLI:

```bash
supabase secrets set SUPABASE_URL=https://jlsqirpmozthuodjbdrj.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase secrets set RESEND_API_KEY=YOUR_RESEND_API_KEY
supabase secrets set FROM_EMAIL=verified-sender@yourdomain.com
supabase secrets set ADMIN_NOTIFY_EMAILS=admin1@yourdomain.com,admin2@yourdomain.com
```

| Secret | الوصف | مطلوب؟ |
|--------|-------|---------|
| `SUPABASE_URL` | رابط مشروع Supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح Service Role (من Project Settings > API) | ✅ |
| `RESEND_API_KEY` | مفتاح Resend لإرسال الإيميلات | ✅ لإرسال الإيميلات |
| `FROM_EMAIL` | البريد المُتحقق منه في Resend | ✅ مع Resend |
| `ADMIN_NOTIFY_EMAILS` | قائمة بريد مفصولة بفاصلة للإشعارات | 🟡 اختياري |

> إذا لم يكن لديك حساب Resend: سجّل على https://resend.com وتحقق من دومينك.

## 8) اختبار التدفق كاملًا

### 8.1 اختبار تسجيل دخول الأدمن
- افتح admin.html
- سجّل الدخول بالمستخدم الذي أعطيته role = super_admin

### 8.2 اختبار نموذج المواعيد
- أرسل موعدًا من الموقع.
- يجب أن يظهر في Admin Panel تحت Appointments كـ pending.
- عند Accept أو Deny يجب أن تتحدث الحالة.

### 8.3 اختبار نموذج التواصل
- أرسل رسالة من قسم Contact.
- يجب أن تُحفظ في contact_messages.
- يجب أن تصل إشعارات بريد للأدمن (إذا إعداد Resend صحيح).

### 8.4 اختبار Reset Password
- من شاشة تسجيل الدخول/استعادة كلمة المرور في Supabase Auth.
- تأكد أن رابط البريد يفتح Vercel domain وليس localhost.

## 9) استعلامات فحص سريعة (SQL)

```sql
-- قائمة الأدمن الحاليين
select user_id, role, created_at
from public.admin_profiles
order by created_at desc;

-- آخر 20 موعد
select id, full_name, email, status, created_at
from public.appointments
order by created_at desc
limit 20;

-- آخر 20 رسالة تواصل
select id, full_name, email, status, created_at
from public.contact_messages
order by created_at desc
limit 20;

-- إعدادات الموقع
select key, value, updated_at
from public.site_settings
order by key;
```

## 10) أخطاء شائعة وحلها

### روابط reset password تذهب إلى localhost — 🔴 المشكلة الحالية
**السبب:** Site URL في Supabase ما زالت تشير إلى localhost.

**الحل:** اضبط URL Configuration كما في الخطوة 2:
- **Authentication > URL Configuration > Site URL** = `https://vetcare-fymoxd5py-mohammeddilgash-archs-projects.vercel.app`

### خطأ check constraint على admin_profiles.role
**السبب:** استخدام `"super_admin"` بأقواس مزدوجة بدل `'super_admin'`.

**الحل:** استخدم نصًا بأقواس مفردة فقط في SQL.

### الأدمن لا يرى البيانات
**السبب المحتمل:** المستخدم موجود في `auth.users` لكن ليس له صف في `admin_profiles`.

**الحل:** أضف صفًا له:
```sql
insert into public.admin_profiles (user_id, role)
values ('PUT_REAL_UUID_HERE', 'admin');
```

### Edge Function تُعيد خطأ 500 "Missing Supabase env vars"
**السبب:** الـ Secrets لم تُضبط أو لم تُنشر الـ Function بعدها.

**الحل:** تحقق من Project Settings > Edge Functions > Secrets وأعد النشر.

## 11) خطوة أمان موصى بها بعد الإعداد

بعد نجاح النظام:
- غيّر كلمة مرور الأدمن الأول إلى قوية.
- لا تشارك service_role_key خارج بيئة السيرفر.
- احصر لوحة الأدمن على دومين موثوق وراقب سجلات Edge Functions.
