import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import connectDB from "@/lib/db/mongodb";
import Export from "@/lib/db/models/export";
import User from "@/lib/db/models/user";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const exports = await Export.find({
      userId: (session.user as unknown as { id: string }).id,
    }).sort({ createdAt: -1 });

    return NextResponse.json(exports);
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    await connectDB();

    const exportRecord = await Export.create({
      userId: (session.user as unknown as { id: string }).id,
      ...body,
    });

    // Update user stats
    await User.findByIdAndUpdate(
      (session.user as unknown as { id: string }).id,
      {
        $inc: {
          "stats.totalExports": 1,
          "stats.totalProcessingTimeMs": body.metrics?.processingTimeMs || 0,
        },
      },
    );

    return NextResponse.json(exportRecord, { status: 201 });
  } catch (error) {
    console.error("Export API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
