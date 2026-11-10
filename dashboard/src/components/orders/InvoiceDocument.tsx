import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import dayjs from "dayjs";
import type { DbOrder, DbOrderItem } from "../../types/index.ts";
import { LOGO_BASE64 } from "./logoBase64.ts";

interface InvoiceDocumentProps {
  order: DbOrder;
  businessName: string;
  upiId: string;
}

const C = {
  navy:       "#0f172a",
  navyMid:    "#1e293b",
  amber:      "#f59e0b",
  amberLight: "#fef3c7",
  green:      "#059669",
  greenLight: "#d1fae5",
  red:        "#dc2626",
  gray50:     "#f9fafb",
  gray100:    "#f3f4f6",
  gray200:    "#e5e7eb",
  gray300:    "#d1d5db",
  gray400:    "#9ca3af",
  gray500:    "#6b7280",
  gray600:    "#4b5563",
  gray700:    "#374151",
  gray800:    "#1f2937",
  dark:       "#0f172a",
  white:      "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.gray800,
    backgroundColor: C.white,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
  },

  // ── HEADER ───────────────────────────────────────────────────
  header: {
    backgroundColor: C.navy,
    paddingHorizontal: 44,
    paddingTop: 28,
    paddingBottom: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoImg: {
    width: 46,
    height: 52,
    marginRight: 14,
  },
  businessName: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.amber,
  },
  businessTagline: {
    fontSize: 8,
    color: C.gray400,
    marginTop: 2,
  },
  businessLocation: {
    fontSize: 8,
    color: C.gray500,
    marginTop: 1,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  invoiceWord: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textAlign: "right",
  },
  invoiceNum: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.amber,
    marginTop: 4,
    textAlign: "right",
  },
  invoiceDate: {
    fontSize: 9,
    color: C.gray400,
    marginTop: 2,
    textAlign: "right",
  },

  // ── AMBER STRIPE ─────────────────────────────────────────────
  amberStripe: {
    height: 4,
    backgroundColor: C.amber,
  },

  // ── META ROW ─────────────────────────────────────────────────
  metaRow: {
    backgroundColor: C.gray50,
    paddingHorizontal: 44,
    paddingVertical: 20,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.gray200,
  },
  billToCol: {
    flex: 1,
    marginRight: 20,
  },
  metaLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.amber,
    marginBottom: 6,
  },
  customerName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
  },
  customerMeta: {
    fontSize: 9,
    color: C.gray600,
    marginTop: 3,
  },
  invoiceDetailsCol: {
    width: 240,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  detailLabel: {
    fontSize: 9,
    color: C.gray500,
  },
  detailValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
    textAlign: "right",
  },
  detailValueGreen: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.green,
    textAlign: "right",
  },

  // ── BODY ─────────────────────────────────────────────────────
  body: {
    paddingHorizontal: 44,
    paddingTop: 24,
    paddingBottom: 0,
  },

  // ── TABLE ────────────────────────────────────────────────────
  tableHead: {
    flexDirection: "row",
    backgroundColor: C.navy,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  thDesc: { flex: 3.5, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.amber },
  thQty:  { flex: 0.7, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.amber, textAlign: "center" },
  thUnit: { flex: 1.5, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.amber, textAlign: "right" },
  thAmt:  { flex: 1.5, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.amber, textAlign: "right" },

  tableRow: {
    flexDirection: "row",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  tableRowAlt: {
    backgroundColor: C.gray50,
  },
  tdDesc: { flex: 3.5 },
  tdQty:  { flex: 0.7, textAlign: "center" },
  tdUnit: { flex: 1.5, textAlign: "right" },
  tdAmt:  { flex: 1.5, textAlign: "right" },
  itemName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
  },
  itemDesc: {
    fontSize: 8,
    fontFamily: "Helvetica-Oblique",
    color: C.gray400,
    marginTop: 2,
  },
  cellText: {
    fontSize: 10,
    color: C.gray700,
  },
  cellBold: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
  },
  tableClosingLine: {
    height: 2,
    backgroundColor: C.navy,
    marginBottom: 20,
  },

  // ── TOTALS + PAYMENT ─────────────────────────────────────────
  totalsPaymentRow: {
    flexDirection: "row",
    marginBottom: 20,
  },
  paymentBox: {
    flex: 1,
    marginRight: 20,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  paymentBoxLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.amber,
    marginBottom: 10,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
  },
  paymentRowLabel: {
    fontSize: 8,
    color: C.gray500,
    width: 80,
    marginRight: 8,
  },
  paymentRowValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
  },
  upiScanHint: {
    backgroundColor: C.amberLight,
    borderRadius: 4,
    padding: 8,
    marginTop: 4,
  },
  upiScanHintText: {
    fontSize: 8,
    color: C.gray700,
    textAlign: "center",
  },
  totalsBox: {
    width: 230,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 4,
  },
  totalsInner: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLineLabel: {
    fontSize: 9,
    color: C.gray500,
  },
  totalLineValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
  },
  totalLineValueAmber: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.amber,
  },
  totalsDivider: {
    height: 1,
    backgroundColor: C.gray300,
    marginVertical: 4,
  },
  grandTotalBand: {
    backgroundColor: C.navy,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  grandTotalValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.amber,
  },
  paidArea: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  paidRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  paidLabel:         { fontSize: 9, color: C.green },
  paidValue:         { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.green },
  balanceLabelAmber: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.amber },
  balanceValueAmber: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.amber },
  balanceLabelGreen: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.green },
  balanceValueGreen: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.green },

  // ── STATUS + NOTES ───────────────────────────────────────────
  statusSection: {
    paddingHorizontal: 44,
    paddingBottom: 20,
  },
  stampRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
  },
  paidStamp: {
    backgroundColor: C.green,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 28,
  },
  paidStampText: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },
  dueStamp: {
    backgroundColor: C.amber,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 28,
  },
  dueStampText: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
  },
  notesBox: {
    backgroundColor: C.gray50,
    borderLeftWidth: 3,
    borderLeftColor: C.amber,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  notesLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.amber,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 9,
    color: C.gray600,
  },

  // ── FOOTER ───────────────────────────────────────────────────
  footer: {
    backgroundColor: C.navy,
    paddingHorizontal: 44,
    paddingVertical: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  footerThank: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 5,
  },
  footerPolicy: {
    fontSize: 8,
    color: C.gray400,
    marginBottom: 3,
  },
  footerRight: {
    alignItems: "flex-end",
  },
  footerGenerated: {
    fontSize: 7,
    color: C.gray500,
    marginBottom: 3,
  },
  footerTimestamp: {
    fontSize: 7,
    color: C.gray500,
  },
});

function rs(value: string | number | undefined): string {
  const n = Number(value ?? 0);
  return `Rs. ${n.toLocaleString("en-IN")}`;
}

function ItemRow({ item, index }: { item: DbOrderItem; index: number }) {
  const qty   = item.quantity;
  const unit  = Number(item.unitPrice ?? 0);
  const total = item.lineTotal !== undefined ? Number(item.lineTotal) : qty * unit;
  const alt   = index % 2 === 1;

  return (
    <View style={[styles.tableRow, alt ? styles.tableRowAlt : {}]}>
      <View style={styles.tdDesc}>
        <Text style={styles.itemName}>{item.productName}</Text>
        {item.productDescription ? (
          <Text style={styles.itemDesc}>{item.productDescription}</Text>
        ) : null}
      </View>
      <View style={styles.tdQty}>
        <Text style={styles.cellText}>{qty}</Text>
      </View>
      <View style={styles.tdUnit}>
        <Text style={styles.cellText}>{rs(unit)}</Text>
      </View>
      <View style={styles.tdAmt}>
        <Text style={styles.cellBold}>{rs(total)}</Text>
      </View>
    </View>
  );
}

export function InvoiceDocument({ order, businessName, upiId }: InvoiceDocumentProps) {
  const subtotal    = Number(order.subtotal ?? 0);
  const delivery    = Number(order.deliveryCharge ?? 0);
  const discount    = Number(order.discountAmount ?? 0);
  const totalAmount = Number(order.totalAmount ?? 0);
  const totalPaid   = order.paymentSummary?.totalPaid ?? 0;
  const balanceDue  = order.paymentSummary?.balanceDue ?? Math.max(0, totalAmount - totalPaid);
  const fullyPaid   = balanceDue === 0 && totalPaid > 0;
  const dateStr     = dayjs(order.createdAt).format("DD MMM YYYY");
  const channel     = order.channel === "instagram" ? "Instagram" : "WhatsApp";

  const statusDelivered = order.status === "delivered";

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Image src={LOGO_BASE64} style={styles.logoImg} />
            <View>
              <Text style={styles.businessName}>{businessName}</Text>
              <Text style={styles.businessTagline}>Handcrafted Resin Art</Text>
              <Text style={styles.businessLocation}>Coimbatore, Tamil Nadu</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.invoiceWord}>INVOICE</Text>
            <Text style={styles.invoiceNum}>#{order.orderNo}</Text>
            <Text style={styles.invoiceDate}>{dateStr}</Text>
          </View>
        </View>

        {/* ── AMBER STRIPE ── */}
        <View style={styles.amberStripe} />

        {/* ── META ROW ── */}
        <View style={styles.metaRow}>
          <View style={styles.billToCol}>
            <Text style={styles.metaLabel}>BILL TO</Text>
            <Text style={styles.customerName}>{order.customerName}</Text>
            {order.customerPhone ? (
              <Text style={styles.customerMeta}>{order.customerPhone}</Text>
            ) : null}
            {order.customerEmail ? (
              <Text style={styles.customerMeta}>{order.customerEmail}</Text>
            ) : null}
            {order.shippingAddress ? (
              <Text style={[styles.customerMeta, { lineHeight: 1.4 }]}>{order.shippingAddress}</Text>
            ) : null}
          </View>
          <View style={styles.invoiceDetailsCol}>
            <Text style={styles.metaLabel}>INVOICE DETAILS</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Invoice No</Text>
              <Text style={styles.detailValue}>#{order.orderNo}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Invoice Date</Text>
              <Text style={styles.detailValue}>{dayjs(order.createdAt).format("DD MMM YYYY")}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Due Date</Text>
              <Text style={styles.detailValue}>{dayjs(order.createdAt).add(7, "day").format("DD MMM YYYY")}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Channel</Text>
              <Text style={styles.detailValue}>{channel}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Order Status</Text>
              <Text style={statusDelivered ? styles.detailValueGreen : styles.detailValue}>
                {order.status.replace(/_/g, " ").toUpperCase()}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payment Terms</Text>
              <Text style={styles.detailValue}>Due on Receipt</Text>
            </View>
          </View>
        </View>

        {/* ── BODY ── */}
        <View style={styles.body}>

          {/* Items table */}
          <View style={styles.tableHead}>
            <Text style={styles.thDesc}>DESCRIPTION</Text>
            <Text style={styles.thQty}>QTY</Text>
            <Text style={styles.thUnit}>UNIT PRICE</Text>
            <Text style={styles.thAmt}>AMOUNT</Text>
          </View>
          {order.items.map((item, i) => (
            <ItemRow key={item.id} item={item} index={i} />
          ))}
          <View style={styles.tableClosingLine} />

          {/* Totals + Payment side by side */}
          <View style={styles.totalsPaymentRow}>
            <View style={styles.paymentBox}>
              <Text style={styles.paymentBoxLabel}>PAYMENT INSTRUCTIONS</Text>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentRowLabel}>UPI ID</Text>
                <Text style={styles.paymentRowValue}>{upiId}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentRowLabel}>GPay / PhonePe</Text>
                <Text style={styles.paymentRowValue}>{upiId}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentRowLabel}>Bank Transfer</Text>
                <Text style={styles.paymentRowValue}>On request</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentRowLabel}>Advance</Text>
                <Text style={styles.paymentRowValue}>50% to confirm order</Text>
              </View>
              <View style={styles.upiScanHint}>
                <Text style={styles.upiScanHintText}>Scan any UPI app and pay to {upiId}</Text>
              </View>
            </View>

            <View style={styles.totalsBox}>
              <View style={styles.totalsInner}>
                <View style={styles.totalLine}>
                  <Text style={styles.totalLineLabel}>Subtotal</Text>
                  <Text style={styles.totalLineValue}>{rs(subtotal)}</Text>
                </View>
                {delivery > 0 && (
                  <View style={styles.totalLine}>
                    <Text style={styles.totalLineLabel}>Delivery</Text>
                    <Text style={styles.totalLineValue}>{rs(delivery)}</Text>
                  </View>
                )}
                {discount > 0 && (
                  <View style={styles.totalLine}>
                    <Text style={styles.totalLineLabel}>Discount</Text>
                    <Text style={styles.totalLineValueAmber}>-{rs(discount)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.totalsDivider} />
              <View style={styles.grandTotalBand}>
                <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
                <Text style={styles.grandTotalValue}>{rs(totalAmount)}</Text>
              </View>
              <View style={styles.paidArea}>
                <View style={styles.paidRow}>
                  <Text style={styles.paidLabel}>Amount Paid</Text>
                  <Text style={styles.paidValue}>{rs(totalPaid)}</Text>
                </View>
                <View style={styles.paidRow}>
                  <Text style={balanceDue > 0 ? styles.balanceLabelAmber : styles.balanceLabelGreen}>
                    Balance Due
                  </Text>
                  <Text style={balanceDue > 0 ? styles.balanceValueAmber : styles.balanceValueGreen}>
                    {rs(balanceDue)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── STATUS STAMP + NOTES ── */}
        <View style={styles.statusSection}>
          <View style={styles.stampRow}>
            {fullyPaid ? (
              <View style={styles.paidStamp}>
                <Text style={styles.paidStampText}>PAID IN FULL</Text>
              </View>
            ) : (
              <View style={styles.dueStamp}>
                <Text style={styles.dueStampText}>{`BALANCE DUE  ${rs(balanceDue)}`}</Text>
              </View>
            )}
          </View>
          {order.customerNotes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>ORDER NOTES</Text>
              <Text style={styles.notesText}>{order.customerNotes}</Text>
            </View>
          ) : null}
        </View>

        {/* ── FOOTER ── */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerThank}>Thank you for your business!</Text>
            <Text style={styles.footerPolicy}>Returns accepted within 24h of delivery for transit damage with photo proof.</Text>
            <Text style={styles.footerPolicy}>No returns on custom orders.</Text>
          </View>
          <View style={styles.footerRight}>
            <Text style={styles.footerGenerated}>Generated by Saba Art Assistant</Text>
            <Text style={styles.footerTimestamp}>{dayjs().format("DD MMM YYYY, hh:mm A")}</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
