// 病例（病人 + 初步方案）与手术规划列表。
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { requireActor } from "@/lib/auth";
import { readJson, textField, integerField, enumField } from "@/lib/validation";
import { apiError, limitAction } from "@/lib/http";


export async function GET(req: Request) {
  try {
    const actor = await requireActor(req);
    const store = getStore();
    return Response.json({ plans: await store.listPlans(actor.id), store: store.kind });
  } catch (error) { return apiError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    const body = await readJson(req);
    const input = {
      ownerId: actor.id,
      name: textField(body, "patientName", 100),
      gender: enumField(body.gender ?? "", ["", "男", "女"], "gender"),
      age: integerField(body.age ?? 0, 0, 130, "age"),
      medicalRecord: textField(body, "medicalRecord", 20000),
      preliminaryPlan: textField(body, "preliminaryPlan", 10000, true),
      title: textField(body, "title", 200, true),
    };
    const store = getStore();
    await limitAction(store, actor.id, "case-create", 10);
    return Response.json(await store.createCase(input), { status: 201 });
  } catch (error) { return apiError(error); }
}
