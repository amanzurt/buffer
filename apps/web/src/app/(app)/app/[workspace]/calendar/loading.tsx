export default function CalendarLoading() {
  return (
    <div className="p-6 max-w-5xl animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-28 bg-gray-200 rounded" />
        <div className="h-8 w-28 bg-indigo-100 rounded-lg" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white h-[600px]" />
    </div>
  );
}
