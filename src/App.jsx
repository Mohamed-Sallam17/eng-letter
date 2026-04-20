import { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import './App.css'

const STORAGE_KEY = 'letters'

const getToday = () => new Date().toISOString().split('T')[0]

const createInitialLetter = (number = '') => ({
  date: getToday(),
  letterNumber: number,
  recipient: 'إدارة مدينة الملك خالد العسكرية للتشغيل والصيانة',
  subject: 'طلب إصدار شهادة انجاز',
  projectName:
    'مشروع تنفيذ أعمال التشغيل والصيانة العامة بموجب العقد رقم (2026/41/AKC) لصالح مدينة الملك خالد العسكرية.',
  status: 'publish',
})

const toArabicDate = (value) => {
  if (!value) return ''

  const parsed = new Date(`${value}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed)
}

const formatLetterNumber = (value) => {
  const trimmed = String(value ?? '').trim()
  return trimmed ? `${trimmed} / 2026` : '... / 2026'
}

const sanitizeFileName = (value) => {
  const baseName =
    value === null || value === undefined || value === '' ? 'خطاب' : `${value}`

  const withoutInvalidCharacters = baseName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
  const withNormalizedSpaces = withoutInvalidCharacters.replace(/\s+/g, ' ')
  const safeFileName = withNormalizedSpaces.trim()

  return safeFileName || 'خطاب'
}

function App() {
  const previewRef = useRef(null)
  const [letter, setLetter] = useState(() => createInitialLetter('1'))
  const [isExporting, setIsExporting] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const formData = letter

  useEffect(() => {
    const storedLetters = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const lastSavedNumber = [...storedLetters]
      .reverse()
      .find((item) => item?.letterNumber)?.letterNumber

    const suggestedNumber = Number.parseInt(lastSavedNumber ?? '0', 10) + 1

    setLetter((current) => ({
      ...current,
      letterNumber:
        current.letterNumber && current.letterNumber !== '1'
          ? current.letterNumber
          : String(Number.isNaN(suggestedNumber) ? 1 : suggestedNumber),
    }))
  }, [])

  useEffect(() => {
    if (!saveMessage) return undefined

    const timeout = window.setTimeout(() => setSaveMessage(''), 2500)
    return () => window.clearTimeout(timeout)
  }, [saveMessage])

  const handleChange = (field) => (event) => {
    setLetter((current) => ({
      ...current,
      [field]: event.target.value,
    }))
  }

  const handleSave = () => {
    const storedLetters = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const payload = {
      ...letter,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      previewLetterNumber: formatLetterNumber(formData.letterNumber),
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify([...storedLetters, payload]))

    setSaveMessage(letter.status === 'publish' ? 'تم حفظ الخطاب النهائي' : 'تم حفظ المسودة')
  }

  const handleDownloadPdf = async () => {
    if (!previewRef.current) return

    const previewElement = previewRef.current
    const previousStyles = {
      display: previewElement.style.display,
      position: previewElement.style.position,
      left: previewElement.style.left,
      top: previewElement.style.top,
      zIndex: previewElement.style.zIndex,
      transform: previewElement.style.transform,
      width: previewElement.style.width,
      maxWidth: previewElement.style.maxWidth,
      minHeight: previewElement.style.minHeight,
      aspectRatio: previewElement.style.aspectRatio,
    }

    try {
      setIsExporting(true)

      if (document.fonts?.ready) {
        await document.fonts.ready
      }

      previewElement.style.display = 'block'
      previewElement.style.position = 'fixed'
      previewElement.style.left = '-9999px'
      previewElement.style.top = '0'
      previewElement.style.zIndex = '-1'
      previewElement.style.transform = 'none'
      previewElement.style.width = '210mm'
      previewElement.style.maxWidth = '210mm'
      previewElement.style.minHeight = '297mm'
      previewElement.style.aspectRatio = 'auto'

      const canvas = await html2canvas(previewElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f8f5ef',
        onclone: (clonedDoc) => {
          const el = clonedDoc.body.querySelector('[data-preview-container]')
          if (el) {
            el.style.color = '#000000'
            el.style.backgroundColor = '#f8f5ef'
            el.style.borderColor = '#e5e7eb'

            const clonedNodes = el.querySelectorAll('*')
            clonedNodes.forEach((node) => {
              const currentNode = node
              currentNode.style.color = '#000000'
              currentNode.style.borderColor = '#e5e7eb'

              const computedStyle = clonedDoc.defaultView?.getComputedStyle(currentNode)
              const computedBackgroundImage = computedStyle?.backgroundImage || ''
              const computedBackgroundColor = computedStyle?.backgroundColor || ''

              if (computedBackgroundImage.includes('oklch')) {
                currentNode.style.backgroundImage = 'none'
              }

              if (computedBackgroundColor.includes('oklch')) {
                currentNode.style.backgroundColor = 'transparent'
              }
            })
          }
        },
      })

      const imageData = canvas.toDataURL('image/jpeg', 0.9)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      pdf.addImage(imageData, 'JPEG', 0, 0, 210, 297)

      const fileName = `${sanitizeFileName(letter.subject)}-${letter.date}-${sanitizeFileName(
        letter.letterNumber,
      )}.pdf`

      try {
        pdf.save(fileName)
      } catch (saveError) {
        const pdfBlob = pdf.output('blob')
        const objectUrl = URL.createObjectURL(pdfBlob)
        const downloadLink = document.createElement('a')

        downloadLink.href = objectUrl
        downloadLink.download = fileName
        downloadLink.rel = 'noopener'
        document.body.appendChild(downloadLink)
        downloadLink.click()
        document.body.removeChild(downloadLink)

        if (!('download' in HTMLAnchorElement.prototype)) {
          window.open(objectUrl, '_blank', 'noopener,noreferrer')
        }

        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)

        console.error('PDF Save Fallback:', saveError)
      }

      setSaveMessage('تم تحميل ملف PDF بنجاح')
    } catch (error) {
      console.error('PDF Export Error:', error)
      setSaveMessage('حدث خطأ في الألوان أو التنسيق، يرجى المحاولة مرة أخرى')
    } finally {
      previewElement.style.display = previousStyles.display
      previewElement.style.position = previousStyles.position
      previewElement.style.left = previousStyles.left
      previewElement.style.top = previousStyles.top
      previewElement.style.zIndex = previousStyles.zIndex
      previewElement.style.transform = previousStyles.transform
      previewElement.style.width = previousStyles.width
      previewElement.style.maxWidth = previousStyles.maxWidth
      previewElement.style.minHeight = previousStyles.minHeight
      previewElement.style.aspectRatio = previousStyles.aspectRatio
      setIsExporting(false)
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[radial-gradient(circle_at_top,#efe2cf_0%,#f8f5ef_36%,#f2eee7_100%)] px-4 py-6 text-stone-900 md:px-6 lg:px-8"
    >
      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row">
        <section
          className="block w-full rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(109,82,43,0.14)] backdrop-blur md:p-6 lg:w-2/5"
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold tracking-[0.3em] text-amber-700">
                ATWAR AL-KOWN
              </p>
              <h1 className="text-2xl font-black text-stone-900">مولد الخطابات الرسمية</h1>
              <p className="mt-2 text-sm leading-7 text-stone-600">
                أنشئ الخطاب وعدّل تموضعه بصياغة عربية مباشرة مع حفظ محلي وتصدير PDF.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
              <p className="text-xs text-stone-500">رقم العرض</p>
              <p className="mt-1 text-lg font-extrabold text-amber-700">
                {formatLetterNumber(formData.letterNumber)}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="field-shell">
              <span className="field-label">التاريخ</span>
              <input
                className="field-input"
                type="date"
                value={formData.date}
                onChange={handleChange('date')}
              />
            </label>

            <label className="field-shell">
              <span className="field-label">رقم الخطاب</span>
              <input
                className="field-input"
                type="number"
                min="1"
                value={formData.letterNumber}
                onChange={handleChange('letterNumber')}
                placeholder="مثال: 125"
              />
            </label>

            <label className="field-shell">
              <span className="field-label">الجهة المرسل إليها</span>
              <textarea
                className="field-input min-h-28 resize-none"
                value={formData.recipient}
                onChange={handleChange('recipient')}
                placeholder="اكتب اسم الجهة"
              />
            </label>

            <label className="field-shell">
              <span className="field-label">الموضوع</span>
              <input
                className="field-input"
                type="text"
                value={formData.subject}
                onChange={handleChange('subject')}
                placeholder="عنوان الموضوع"
              />
            </label>

            <label className="field-shell">
              <span className="field-label">اسم المشروع</span>
              <textarea
                className="field-input min-h-36 resize-none"
                value={formData.projectName}
                onChange={handleChange('projectName')}
                placeholder="الوصف الكامل للمشروع"
              />
            </label>

            <label className="field-shell">
              <span className="field-label">نوع الحفظ</span>
              <select
                className="field-input"
                value={formData.status}
                onChange={handleChange('status')}
              >
                <option value="publish">نهائي</option>
                <option value="draft">مسودة</option>
              </select>
            </label>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" className="action-button action-button-primary" onClick={handleSave}>
              حفظ {formData.status === 'publish' ? 'نهائي' : 'كمسودة'}
            </button>
            <button
              type="button"
              className="action-button action-button-secondary hidden md:block"
              onClick={handleDownloadPdf}
              disabled={isExporting}
            >
              {isExporting ? 'جارٍ إنشاء الملف...' : 'تنزيل PDF'}
            </button>
          </div>

          <div className="mt-4 flex min-h-7 items-center justify-between text-sm text-stone-500">
            <span>{saveMessage}</span>
            <span>الاتجاه: من اليمين إلى اليسار</span>
          </div>
        </section>

        <section
          className="pointer-events-none fixed -left-[9999px] top-0 w-[210mm] opacity-0 md:pointer-events-auto md:relative md:left-auto md:top-auto md:block md:w-full md:opacity-100 lg:w-3/5"
          aria-hidden="true"
        >
          <div
            className="preview-frame min-h-[500px] h-fit overflow-x-hidden overflow-y-auto rounded-[1.5rem] bg-gradient-to-br from-stone-200 via-stone-100 to-stone-200 p-3 pb-24 md:p-5"
            style={{
              backgroundColor: '#f8f5ef',
              color: '#000000',
            }}
          >
            <div className="mx-auto w-full max-w-[210mm]">
              <div
                ref={previewRef}
                data-preview-container
                className="letter-page mx-auto"
                style={{
                  backgroundColor: '#f8f5ef',
                  color: '#000000',
                }}
              >
              <div className="letter-brand">
                <div>
                  <p className="text-[0.6875rem] uppercase tracking-[0.45em] text-amber-700">
                    Atwar Al-Kown Contracting
                  </p>
                  <h2 className="mt-3 text-[1.625rem] font-black text-stone-900">
                    أطوار الكون للمقاولات
                  </h2>
                  <p className="mt-2 text-[0.8125rem] leading-6 text-stone-600">
                    نموذج خطاب رسمي قابل للتصدير مع تموضع دقيق فوق الترويسة المعتمدة.
                  </p>
                </div>
                <div className="letter-badge">2026</div>
              </div>

              <div className="letter-guides">
                <span />
                <span />
                <span />
              </div>

              <p className="letter-absolute text-[1.25rem] font-bold" style={{ top: '12.79%', right: '10.48%' }}>
                التاريخ: {toArabicDate(formData.date)}
              </p>

              <p className="letter-absolute text-[1.25rem] font-bold" style={{ top: '16.16%', right: '10.48%' }}>
                رقم الخطاب: {formatLetterNumber(formData.letterNumber)}
              </p>

              <p
                className="letter-absolute max-w-[66.67%] text-[1.3125rem] font-semibold leading-[1.9]"
                style={{ top: '23.91%', right: '10.48%' }}
              >
                السادة / {formData.recipient}
              </p>

              <div
                className="letter-absolute flex w-[79.05%] items-center gap-3 border-y border-stone-400/70 py-2"
                style={{ top: '33%', right: '10.48%' }}
              >
                <span className="text-[1.25rem] font-bold">الموضوع:</span>
                <span className="text-[1.25rem] font-extrabold text-amber-800">{formData.subject}</span>
              </div>

              <div
                className="letter-absolute w-[79.05%] text-[1.25rem] leading-[2.15] text-stone-800"
                style={{ top: '40.4%', right: '10.48%' }}
              >
                <p className="mb-4">
                  السلام عليكم ورحمة الله وبركاته،،،
                </p>
                <p className="mb-4">
                  نفيدكم نحن شركة أطوار الكون للمقاولات بأن أعمال المشروع الموضح أدناه قد تم تنفيذها
                  وإنجازها وفق نطاق العقد والاشتراطات المعتمدة.
                </p>
                <p className="rounded-[18px] bg-amber-50 px-5 py-4 font-semibold text-stone-900">
                  {formData.projectName}
                </p>
                <p className="mt-5">
                  وعليه نأمل من سعادتكم التكرم بإصدار شهادة إنجاز للمشروع أعلاه، شاكرين لكم حسن
                  تعاونكم وتقديركم.
                </p>
              </div>

              <div
                className="letter-absolute flex w-[79.05%] items-end justify-between"
                style={{ bottom: '12.12%', right: '10.48%' }}
              >
                <div className="text-right">
                  <p className="text-[1.0625rem] text-stone-500">الاعتماد</p>
                  <p className="mt-3 text-[1.375rem] font-black text-stone-900">أطوار الكون للمقاولات</p>
                  <p className="mt-2 text-[1.125rem] text-stone-700">الإدارة التنفيذية</p>
                </div>
                <div className="rounded-full border border-amber-300 px-6 py-6 text-center text-[0.875rem] text-stone-500">
                  ختم الشركة
                </div>
              </div>

              <div className="letter-footer">
                <span>الرياض - المملكة العربية السعودية</span>
                <span>info@atwaralkown.com</span>
                <span>+966 000 000 000</span>
              </div>
            </div>
            </div>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-amber-200 bg-white/95 p-3 shadow-[0_-12px_30px_rgba(28,25,23,0.12)] backdrop-blur md:hidden">
        <button
          type="button"
          className="action-button action-button-secondary w-full"
          onClick={handleDownloadPdf}
          disabled={isExporting}
        >
          {isExporting ? 'جارٍ إنشاء الملف...' : 'تنزيل PDF'}
        </button>
      </div>
    </main>
  )
}

export default App

