"use client";

// 病例录入表单：病历 + 初步手术方案 → 创建手术规划病例。
// 内置示例病例便于快速体验完整流程。
import { useState } from "react";

export interface CaseFormValue {
  patientName: string;
  gender: string;
  age: string;
  medicalRecord: string;
  preliminaryPlan: string;
}

const DEMO_CASE: CaseFormValue = {
  patientName: "王建国",
  gender: "男",
  age: "45",
  medicalRecord: `主诉：转移性右下腹疼痛 18 小时，伴发热、恶心呕吐 2 次。
现病史：晨起无明显诱因出现脐周隐痛，午后疼痛转移并固定于右下腹，持续性加重，行走时明显。伴低热（体温 38.2℃）、恶心，呕吐胃内容物 2 次，末次进餐后腹痛加剧。
既往史：既往体健，否认高血压、糖尿病、冠心病史；否认手术史、药物过敏史。
查体：T 38.2℃，P 92 次/分，R 18 次/分，BP 128/78 mmHg。右下腹麦氏点压痛（+）、反跳痛（+）、肌紧张（+），结肠充气试验（+），腰大肌试验（+）。
辅助检查：血常规 WBC 14.6×10⁹/L，中性粒细胞 86.5%；CRP 48.2 mg/L。腹部超声示右下腹条索状包块，阑尾直径约 11mm，壁增厚，周围可见少量积液，考虑急性阑尾炎（化脓性可能）。泌尿系超声未见异常，排除输尿管结石。
初步诊断：急性化脓性阑尾炎（局限腹膜炎早期）`,
  preliminaryPlan: `拟行急诊腹腔镜阑尾切除术（三孔法）。
全身麻醉，头低足高位、左侧倾斜。脐下置观察孔，建立 12-14mmHg 气腹。探查腹腔确认诊断后，离断阑尾系膜与阑尾动脉，根部圈套器结扎，标本装入取物袋经脐部切口取出。若穿孔需冲洗腹腔并视情况放置盆腔引流。术后抗感染 24-48 小时，早期下床活动。`,
};

export default function PatientForm({
  onSubmit,
  busy,
  onCancel,
}: {
  onSubmit: (v: CaseFormValue) => void;
  busy: string | null;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<CaseFormValue>({
    patientName: "",
    gender: "男",
    age: "",
    medicalRecord: "",
    preliminaryPlan: "",
  });

  const set = (k: keyof CaseFormValue, val: string) => setV((p) => ({ ...p, [k]: val }));

  return (
    <div className="panel mx-auto max-w-[760px] p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-[var(--heading)]">新建手术规划病例</h2>
        <button className="btn !py-1 !text-[12px]" onClick={() => setV(DEMO_CASE)}>
          📋 填入示例病例（急性阑尾炎）
        </button>
      </div>
      <p className="mb-5 text-[12.5px] text-[var(--muted)]">
        录入病历与初步方案后，AI 将结合手术知识库生成结构化手术规划，并自动编排 3D 模拟。
      </p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="sm:col-span-1">
          <label className="label">患者姓名 *</label>
          <input
            className="input"
            value={v.patientName}
            onChange={(e) => set("patientName", e.target.value)}
            placeholder="姓名"
          />
        </div>
        <div>
          <label className="label">性别</label>
          <select className="select" value={v.gender} onChange={(e) => set("gender", e.target.value)}>
            <option>男</option>
            <option>女</option>
          </select>
        </div>
        <div>
          <label className="label">年龄</label>
          <input
            className="input"
            value={v.age}
            onChange={(e) => set("age", e.target.value)}
            placeholder="45"
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="label">病历摘要（主诉 / 现病史 / 既往史 / 查体 / 辅助检查 / 诊断）</label>
        <textarea
          className="textarea min-h-[170px]"
          value={v.medicalRecord}
          onChange={(e) => set("medicalRecord", e.target.value)}
          placeholder="粘贴或输入病历内容…"
        />
      </div>

      <div className="mb-5">
        <label className="label">手术初步方案</label>
        <textarea
          className="textarea min-h-[110px]"
          value={v.preliminaryPlan}
          onChange={(e) => set("preliminaryPlan", e.target.value)}
          placeholder="拟施术式、麻醉方式、体位、关键步骤…"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button className="btn" onClick={onCancel} disabled={!!busy}>
            取消
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={() => onSubmit(v)}
          disabled={!v.patientName.trim() || !v.medicalRecord.trim() || !!busy}
        >
          {busy ?? "创建病例"}
        </button>
      </div>
    </div>
  );
}
