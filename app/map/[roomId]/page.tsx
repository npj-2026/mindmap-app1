import { MindMapApp } from "@/components/MindMapApp";

type PageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ token?: string; mode?: string }>;
};

export default async function MapPage({ params, searchParams }: PageProps) {
  const { roomId } = await params;
  const query = await searchParams;

  return (
    <MindMapApp
      roomId={roomId}
      token={query.token ?? ""}
      initialMode={query.mode === "view" ? "view" : "edit"}
    />
  );
}
