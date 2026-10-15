import { ButtonLink, Container } from '../components/ui';

export default function NotFound() {
  return (
    <section className="py-28 text-center sm:py-40">
      <Container>
        <p className="font-script text-[44px] text-brand">Oops</p>
        <h1 className="mt-2 text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
          This page isn’t on the menu
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[18px] text-muted">
          The link may be old or mistyped. Looking for a food spot’s store? Use the link they shared
          with you.
        </p>
        <ButtonLink href="/" size="lg" className="mt-8">
          Back to the home page
        </ButtonLink>
      </Container>
    </section>
  );
}
