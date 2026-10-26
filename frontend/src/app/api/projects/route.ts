import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import connectDB from "@/lib/db/mongodb";
import Project from "@/lib/db/models/project";

const isLocalFirst = () =>
  process.env.LOCAL_FIRST_MODE === "1" ||
  process.env.NEXT_PUBLIC_LOCAL_FIRST_MODE === "1";

// GET /api/projects - Get all projects for current user
export async function GET() {
  if (isLocalFirst()) {
    return NextResponse.json([]);
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const projects = await Project.find({
      userId: (session.user as { id: string }).id,
    }).sort({ createdAt: -1 });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    await connectDB();

    const project = await Project.create({
      userId: (session.user as unknown as { id: string }).id,
      source: body.source,
      status: "draft",
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
