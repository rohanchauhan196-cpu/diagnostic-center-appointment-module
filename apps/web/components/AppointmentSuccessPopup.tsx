"use client";

import { useState } from "react";
import { CheckCircle2, Copy, FileText, Send } from "lucide-react";

type PopupData = {
  patientName: string;
  phoneNumber: string;
  appointmentDate: string; // DD Month YYYY
  slotTime: string;
  testName: string;
  totalPrice: number;
  locationName: string;
  bookedBy: string;
  instructions: string | null;
  mapLink: string | null;
  qrCodeUrl: string | null;
  address: string | null;
  proName?: string | null;
  scanName?: string | null;
  cityHospital?: string | null;
  referredDoctor?: string | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: PopupData | null;
}

export function AppointmentSuccessPopup({ isOpen, onClose, data }: Props) {
  const [activeTab, setActiveTab] = useState<"patient" | "internal">("patient");
  const [copiedType, setCopiedType] = useState<string | null>(null);

  if (!isOpen || !data) return null;

  const generateInternalMessage = () => {
    let msg = `*Appointment Booked Successfully*\n\n`;
    msg += `Patient Name : ${data.patientName}\n`;
    msg += `Mobile Number : ${data.phoneNumber || "N/A"}\n`;
    msg += `Date : ${data.appointmentDate}\n`;
    msg += `Appointment Time : ${data.slotTime}\n`;
    msg += `Scan Name : ${data.testName}\n`;
    if (data.scanName) {
      msg += `Scan Procedure : ${data.scanName}\n`;
    }
    msg += `Amount : ${data.totalPrice ? `₹${data.totalPrice}` : `N/A`}\n`;
    msg += `Location : ${data.locationName}\n`;
    msg += `Booked by : ${data.bookedBy}\n`;
    msg += `PRO Name : ${data.proName || "SELF"}\n`;
    if (data.cityHospital) {
      msg += `Referred City : ${data.cityHospital}\n`;
    }
    return msg;
  };

  const generatePatientMessage = () => {
    const scanDisplay = data.scanName ? `${data.testName} (${data.scanName})` : data.testName;
    const amountDisplay = data.totalPrice ? `₹${data.totalPrice}` : `N/A`;

    let msg = `Dear ${data.patientName}, Your Appointment is booked on ${data.appointmentDate} at ${data.slotTime} for ${scanDisplay} with ${amountDisplay} at ${data.locationName}, Booked by ${data.bookedBy}\n`;
    msg += `Registered number :- ${data.phoneNumber || "N/A"}\n`;

    if (data.address) {
      msg += `\nAddress\n${data.address}\n`;
    }

    if (data.mapLink) {
      msg += `\nLocation Map Link\n${data.mapLink}\n`;
    }

    msg += `\n*Report will be delivered the next Working Day*\n` +
      `*रिपोर्ट अगले कामकाजी दिन डिलीवर की जाएगी।*\n`;

    if (data.instructions) {
      msg += `\nInstruction Attached (as per test)\n${data.instructions}\n`;
    }

    const pro = (data.proName || "").trim().toUpperCase();
    if (pro === "ESI") {
      msg += `\nकृपया अपने निर्धारित ईएसआई स्कैन के समय निम्नलिखित मूल दस्तावेज साथ लेकर अवश्य आएं:\n\n` +
        `* ईएसआई कार्ड\n` +
        `* ईएसआई रेफरल पत्र\n` +
        `* आधार कार्ड (मरीज एवं कार्ड धारक दोनों का)\n` +
        `* डॉक्टर द्वारा दिया गया पर्चा / संबंधित मेडिकल दस्तावेज\n` +
        `* एक हाल ही की पासपोर्ट साइज फोटो\n\n` +
        `कृपया ध्यान दें कि उपरोक्त सभी दस्तावेज लाना सभी ईएसआई मरीजों के लिए अनिवार्य है। किसी भी दस्तावेज के अभाव में आपकी जांच में देरी हो सकती है या पुनर्निर्धारित किया जा सकता है।\n\n\n\n\n` +
        `Kripya apne ESI scan ke samay niche diye gaye sabhi original documents saath lekar aayein:\n\n` +
        `* ESI Card\n` +
        `* ESI Referral Letter\n` +
        `* Aadhaar Card (Patient aur Card Holder dono ka)\n` +
        `* Doctor ka Prescription / Medical Papers\n` +
        `* Ek recent passport size photo\n\n` +
        `Yeh sabhi documents lana mandatory hai sabhi ESI patients ke liye. Agar koi document missing hua to scan delay ya reschedule ho sakta hai.\n\n` +
        `Aapke sahyog ke liye dhanyavaad.\n`;
    } else if (pro === "DAK") {
      msg += `\nDAK Patients\n\n` +
        `Please Carry All Documents:\n\n` +
        `1. ABHA ID*\n` +
        `2. DAK Form with Nodal Officer’s Sign & Stamp*\n` +
        `3. Complete KFT Report*\n` +
        `4. Patient’s Aadhaar Card / Voter ID Card*\n` +
        `5. OPD Paper / Doctor’s Prescription*\n` +
        `6. Previous PET CT Scan CD & Reports*\n` +
        `7. All Previous Medical Reports*\n\n` +
        `*कृपया सभी आवश्यक दस्तावेज़ साथ लेकर आएं:*\n\n` +
        `1. ABHA ID*\n` +
        `2. Nodal Officer के Sign एवं Stamp वाला DAK Form*\n` +
        `3. KFT की पूरी रिपोर्ट*\n` +
        `4. मरीज का Aadhaar Card / Voter ID Card*\n` +
        `5. OPD Paper / डॉक्टर की Prescription*\n` +
        `6. पिछली PET CT Scan की CD एवं Reports*\n` +
        `7. सभी पुरानी Medical Reports*\n`;
    }

    return msg;
  };

  const copyMessage = (type: "patient" | "internal") => {
    const text = type === "patient" ? generatePatientMessage() : generateInternalMessage();
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const currentPreview = activeTab === "patient" ? generatePatientMessage() : generateInternalMessage();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg border dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 flex flex-col items-center justify-center text-white shrink-0">
          <CheckCircle2 size={42} className="mb-1.5" />
          <h2 className="text-xl font-bold">Appointment Details</h2>
          <p className="text-emerald-100 text-xs opacity-90">Ready to copy for WhatsApp or internal share</p>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 px-4 pt-2 shrink-0 gap-2">
          <button
            onClick={() => setActiveTab("patient")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === "patient"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-900 rounded-t-md shadow-sm"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Send size={13} />
            Patient Message (WhatsApp)
          </button>
          <button
            onClick={() => setActiveTab("internal")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === "internal"
                ? "border-blue-600 text-blue-700 dark:text-blue-400 bg-white dark:bg-slate-900 rounded-t-md shadow-sm"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <FileText size={13} />
            Internal Message (Details Only)
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-300">
            {currentPreview}
          </div>

          {activeTab === "patient" && data.qrCodeUrl && (
            <div className="mt-3 flex flex-col items-center border rounded-lg p-3 bg-slate-50 dark:bg-slate-900">
              <span className="text-[11px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">Location QR Code</span>
              <img src={data.qrCodeUrl} alt="Location QR" className="max-w-[180px] h-auto rounded shadow-sm" />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-3.5 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {/* Internal message button */}
            <button
              onClick={() => copyMessage("internal")}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
              title="Copy details only without instructions"
            >
              <Copy size={13} />
              {copiedType === "internal" ? "Copied Details! ✓" : "Copy Internal Msg"}
            </button>

            {/* Patient WhatsApp button */}
            <button
              onClick={() => copyMessage("patient")}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
              title="Copy full message with instructions for WhatsApp"
            >
              <Copy size={13} />
              {copiedType === "patient" ? "Copied for WhatsApp! ✓" : "Copy for WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
