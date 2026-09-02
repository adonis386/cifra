import type { CompanyPrintProfile } from "@/lib/company-print";

export function PrintLetterhead({
  company,
  documentTitle,
}: {
  company: CompanyPrintProfile;
  documentTitle: string;
}) {
  const contact = [company.phone, company.email, company.website]
    .filter(Boolean)
    .join(" · ");

  return (
    <table style={{ width: "100%", marginBottom: 16, borderCollapse: "collapse" }}>
      <tbody>
        <tr>
          <td style={{ width: "62%", verticalAlign: "top" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {company.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logo_url}
                  alt=""
                  width={64}
                  height={64}
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: "contain",
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                  }}
                />
              ) : null}
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#0f172a",
                    lineHeight: 1.15,
                  }}
                >
                  {company.name}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                  RIF {company.rif}
                </p>
                {company.print_subtitle ? (
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#475569" }}>
                    {company.print_subtitle}
                  </p>
                ) : null}
                {company.address ? (
                  <p style={{ margin: "6px 0 0", fontSize: 11 }}>{company.address}</p>
                ) : null}
                {contact ? (
                  <p style={{ margin: "2px 0 0", fontSize: 11 }}>{contact}</p>
                ) : null}
              </div>
            </div>
          </td>
          <td style={{ verticalAlign: "top", textAlign: "right" }}>
            <p
              className="print-title"
              style={{ color: "#0f172a", margin: 0, fontSize: 16 }}
            >
              {documentTitle}
            </p>
            <div
              style={{
                marginTop: 8,
                height: 3,
                background: "#1d6de6",
                width: "100%",
                marginLeft: "auto",
              }}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function PrintFooter({ company }: { company: CompanyPrintProfile }) {
  const footer =
    company.print_footer?.trim() ||
    `Emitido por Sifra · ${company.name} · ${company.rif}`;

  return (
    <div
      style={{
        marginTop: 28,
        paddingTop: 10,
        borderTop: "1px solid #cbd5e1",
        fontSize: 10,
        color: "#475569",
      }}
    >
      <p style={{ margin: 0 }}>{footer}</p>
      {(company.email || company.website || company.phone) && (
        <p style={{ margin: "4px 0 0" }}>
          {[company.email, company.website, company.phone].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}
