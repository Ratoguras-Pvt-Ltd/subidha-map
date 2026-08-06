import { DealerExplorer } from "@/components/dealer/dealer-explorer";
import { SiteHeader } from "@/components/site-header";
import { getPublicDealers } from "@/lib/dealers";

export default async function HomePage() {
  // One cached query feeds both the map and the cards — see src/lib/dealers.ts.
  const dealers = await getPublicDealers();

  return (
    // `fixed inset-0` rather than `h-dvh`: this screen is a fixed-viewport app shell
    // where only the dealer list scrolls. As a normal-flow element the long list still
    // leaked height to the document root and gave the whole page a scrollbar; taking
    // it out of flow makes that impossible.
    //
    // `overflow-clip`, not `overflow-hidden`: CSS spec still counts a `hidden` box as
    // a scroll container, just one without visible scrollbars — so `scrollIntoView()`
    // on a selected dealer card (in DealerExplorer) walked past #dealer-list and
    // scrolled THIS box instead, shoving the whole app off-screen and leaving a blank
    // area where nothing had been rendered. `clip` looks identical but is explicitly
    // excluded from the scroll-container chain, which is what "only the dealer list
    // scrolls" actually requires.
    <div className="fixed inset-0 flex flex-col overflow-clip">
      <SiteHeader dealerCount={dealers.length} />

      {/* The map is the product, so it gets the viewport. The h1 stays for crawlers
          and screen readers without stealing vertical space. */}
      <h1 className="sr-only">
        Subidha Gas dealer locator — live LPG cylinder availability across eastern Nepal
      </h1>

      <DealerExplorer dealers={dealers} />
    </div>
  );
}
