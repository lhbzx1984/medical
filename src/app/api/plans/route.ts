// 病例（病人 + 初步方案）与手术规划列表。
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";


export async function GET() {
  const store = getStore();
  const plans = await store.listPlans();
  return Response.json({ plans, store: store.kind });
}

export async function POST(req: NextRequest) {
  let body: {
    patientName?: string;
    gender?: string;
    age?: number;
    medicalRecord?: string;
    preliminaryPlan?: string;
    title?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body.patientName?.trim()) {
    return Response.json({ error: "患者姓名不能为空" }, { status: 400 });
  }
  const store = getStore();
  const patient = await store.createPatient({
    name: body.patientName.trim(),
    gender: body.gender,
    age: body.age,
    medicalRecord: body.medicalRecord,
    preliminaryPlan: body.preliminaryPlan,
  });
  const plan = await store.createPlan({
    patientId: patient.id,
    title: body.title,
  });
  return Response.json({ patient, plan }, { status: 201 });
}
