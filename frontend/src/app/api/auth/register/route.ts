import { NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/user";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return Response.json(
        { message: "Please fill all fields" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return Response.json(
        { message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    await connectDB();

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return Response.json(
        { message: "User already exists with this email" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    return Response.json(
      { message: "User registered successfully", userId: user._id },
      { status: 201 }
    );
  } catch (error) {
    console.error("[register]", error);
    return Response.json(
      { message: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
