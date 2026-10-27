import { jsPDF } from 'jspdf';
export function downloadPlan(plan) {
  const doc=new jsPDF();let y=22;
  const line=(text,size=11)=>{doc.setFontSize(size);const rows=doc.splitTextToSize(String(text),170);for(const row of rows){if(y>275){doc.addPage();y=22;}doc.text(row,20,y);y+=size>14?9:6;}};
  line('Food2Fit | Your weekly plan',22);line(`Downloaded ${new Date().toLocaleDateString()}`);line(`Daily targets: ${plan.mealPlan.targets.calories} kcal | Protein ${plan.mealPlan.targets.protein} g | Carbs ${plan.mealPlan.targets.carbs} g | Fat ${plan.mealPlan.targets.fat} g`);y+=5;
  for(const day of plan.mealPlan.days){line(`Day ${day.day}`,16);for(const meal of day.meals){line(`${meal.type.toUpperCase()}: ${meal.foods.map(f=>`${f.name} (${f.grams} g)`).join(', ')}`);line(`  ${meal.totals.calories} kcal | P ${meal.totals.protein} g | C ${meal.totals.carbs} g | F ${meal.totals.fat} g`);}line(`Daily total: ${day.totals.calories} kcal, protein ${day.totals.protein} g`);y+=4;}
  line('Your movement plan',18);for(const day of plan.workoutPlan.days){line(`Day ${day.day}: ${day.title}`,14);for(const e of day.exercises)line(`${e.name}: ${e.sets} sets x ${e.reps}; ${e.restSeconds}s rest`);}line(`Rest days: ${plan.workoutPlan.restDays.join(', ')||'See active-recovery session'}`);
  if(plan.stale)line('This plan predates your current profile. Regenerate before use.');for(const warning of plan.mealPlan.warnings||[])line(warning);for(const note of [...(plan.mealPlan.notes||[]),...(plan.workoutPlan.notes||[])])line(note);line(`Data sources: ${(plan.mealPlan.sources||[]).join(', ')}`);line('Nutrition values are estimates. Check ingredient labels and your individual needs.');doc.save('food2fit-weekly-plan.pdf');
}
