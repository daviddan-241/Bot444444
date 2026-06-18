import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { detectProject } from '@/lib/detector';
import { createPlan } from '@/lib/router';

const schema = z.object({
  projectName: z.string().min(1),
  files: z.array(z.string()).default([]),
  packageJson: z.record(z.unknown()).optional(),
  requirementsTxt: z.string().optional(),
  dockerfile: z.string().optional()
});

export async function POST(req: NextRequest) {
  const body = schema.parse(await req.json());
  const recommendation = detectProject(body);
  return NextResponse.json(createPlan(body.projectName, recommendation));
}
