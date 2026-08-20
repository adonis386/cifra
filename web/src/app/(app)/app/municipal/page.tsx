import { redirect } from "next/navigation";

export default function MunicipalPage() {
  redirect("/app/withholdings?tab=municipal");
}
