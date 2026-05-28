export default function WorkspaceLoading() {
  return (
    <div className="p-6 max-w-4xl animate-pulse">
      <div className="h-6 w-40 bg-gray-200 rounded mb-2" />
      <div className="h-4 w-24 bg-gray-100 rounded mb-8" />
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white h-24" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-gray-100 bg-white" />
          ))}
        </div>
        <div className="space-y-2">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-gray-100 bg-white" />
          ))}
        </div>
      </div>
    </div>
  );
}
