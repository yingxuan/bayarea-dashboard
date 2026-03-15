import LeekCommunity from "@/components/LeekCommunity";

interface StockCommunityWidgetProps {
  maxItems?: number;
}

export default function StockCommunityWidget({ maxItems = 5 }: StockCommunityWidgetProps) {
  return (
    <section className="section-shell section-shell-market rounded-sm p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-cyan-300/90">华人股市讨论</h2>
      </div>
      <LeekCommunity maxItems={maxItems} hideTitle />
    </section>
  );
}
