import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const previewShellRef = useRef(null)
  const [letter, setLetter] = useState(() => createInitialLetter('1'))
  const [isExporting, setIsExporting] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [mobileView, setMobileView] = useState('form')
  const [previewScale, setPreviewScale] = useState(1)
  const [previewHeight, setPreviewHeight] = useState('297mm')
  const formData = letter
  const isPreviewVisibleOnMobile = mobileView === 'preview'

  const waitForPreviewPaint = async (delay = 0) => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    await new Promise((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise((resolve) => requestAnimationFrame(() => resolve()))
  }

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

  useLayoutEffect(() => {
    const element = previewShellRef.current
    if (!element) return undefined

    const updateScale = () => {
      const isMobile = window.innerWidth < 768

      if (!isMobile) {
        setPreviewScale(1)
        setPreviewHeight('297mm')
        return
      }

      const shellWidth = element.clientWidth
      const horizontalPadding = 12
      const nextScale = Math.min((shellWidth - horizontalPadding) / 794, 1)
      const safeScale = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1

      setPreviewScale(safeScale)
      setPreviewHeight(`${1123 * safeScale}px`)
    }

    updateScale()

    const observer = new ResizeObserver(() => updateScale())
    observer.observe(element)
    window.addEventListener('resize', updateScale)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScale)
    }
  }, [])

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

    try {
      setIsExporting(true)
      const isMobileDevice = window.innerWidth < 768

      if (isMobileDevice && mobileView !== 'preview') {
        setMobileView('preview')
        await waitForPreviewPaint(600)
      }

      if (document.fonts?.ready) {
        await document.fonts.ready
      }

      if (isMobileDevice) {
        await waitForPreviewPaint()
      }

      const canvas = await html2canvas(previewRef.current, {
        scale: isMobileDevice ? 1.5 : 2,
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
      setIsExporting(false)
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[radial-gradient(circle_at_top,#efe2cf_0%,#f8f5ef_36%,#f2eee7_100%)] px-4 py-6 text-stone-900 md:px-6 lg:px-8"
    >
      <div className="mx-auto mb-4 flex max-w-7xl justify-center md:hidden">
        <div className="inline-flex rounded-[1.4rem] border border-white/70 bg-white/90 p-1 shadow-[0_14px_40px_rgba(109,82,43,0.14)] backdrop-blur">
          <button
            type="button"
            className={`mobile-tab ${mobileView === 'form' ? 'mobile-tab-active' : ''}`}
            onClick={() => setMobileView('form')}
          >
            نموذج التحرير
          </button>
          <button
            type="button"
            className={`mobile-tab ${mobileView === 'preview' ? 'mobile-tab-active' : ''}`}
            onClick={() => setMobileView('preview')}
          >
            معاينة الخطاب
          </button>
        </div>
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row">
        <section
          className={`${mobileView === 'preview' ? 'hidden md:block' : 'block'} w-full rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(109,82,43,0.14)] backdrop-blur md:p-6 lg:w-2/5`}
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
          className={`w-full rounded-[2rem] border border-stone-200/80 bg-stone-950/5 p-3 shadow-[0_30px_90px_rgba(56,41,18,0.12)] transition-opacity duration-200 lg:w-3/5 ${
            isPreviewVisibleOnMobile
              ? 'relative z-10 visible opacity-100 md:block'
              : 'pointer-events-none invisible absolute inset-x-0 top-0 opacity-0 md:pointer-events-auto md:visible md:relative md:z-auto md:opacity-100'
          }`}
        >
          <div
            ref={previewShellRef}
            className="preview-frame min-h-[500px] h-fit overflow-x-hidden overflow-y-auto rounded-[1.5rem] bg-gradient-to-br from-stone-200 via-stone-100 to-stone-200 p-3 pb-24 md:p-5"
            style={{
              minHeight: previewHeight,
              backgroundColor: '#f8f5ef',
              color: '#000000',
            }}
          >
            <div
              className="mx-auto w-fit"
              style={{
                transform: `scale(${previewScale})`,
                transformOrigin: 'top center',
              }}
            >
              <div
                ref={previewRef}
                data-preview-container
                className="letter-page mx-auto"
                style={{
                  backgroundColor: '#f8f5ef',
                  color: '#000000',
                  minHeight: '297mm',
                }}
              >
              <div className="letter-brand">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.45em] text-amber-700">
                    Atwar Al-Kown Contracting
                  </p>
                  <h2 className="mt-3 text-[26px] font-black text-stone-900">
                    أطوار الكون للمقاولات
                  </h2>
                  <p className="mt-2 text-[13px] leading-6 text-stone-600">
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

              <p className="letter-absolute text-[20px] font-bold" style={{ top: '38mm', right: '22mm' }}>
                التاريخ: {toArabicDate(formData.date)}
              </p>

              <p className="letter-absolute text-[20px] font-bold" style={{ top: '48mm', right: '22mm' }}>
                رقم الخطاب: {formatLetterNumber(formData.letterNumber)}
              </p>

              <p
                className="letter-absolute max-w-[140mm] text-[21px] font-semibold leading-[1.9]"
                style={{ top: '71mm', right: '22mm' }}
              >
                السادة / {formData.recipient}
              </p>

              <div
                className="letter-absolute flex w-[166mm] items-center gap-3 border-y border-stone-400/70 py-2"
                style={{ top: '98mm', right: '22mm' }}
              >
                <span className="text-[20px] font-bold">الموضوع:</span>
                <span className="text-[20px] font-extrabold text-amber-800">{formData.subject}</span>
              </div>

              <div
                className="letter-absolute w-[166mm] text-[20px] leading-[2.15] text-stone-800"
                style={{ top: '120mm', right: '22mm' }}
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
                className="letter-absolute flex w-[166mm] items-end justify-between"
                style={{ bottom: '36mm', right: '22mm' }}
              >
                <div className="text-right">
                  <p className="text-[17px] text-stone-500">الاعتماد</p>
                  <p className="mt-3 text-[22px] font-black text-stone-900">أطوار الكون للمقاولات</p>
                  <p className="mt-2 text-[18px] text-stone-700">الإدارة التنفيذية</p>
                </div>
                <div className="rounded-full border border-amber-300 px-6 py-6 text-center text-[14px] text-stone-500">
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

