import { getAuthContext } from '@/lib/auth';
import { getDepartmentsForOrg } from '@/services/employee';
import { getCategories, listSkills } from '@/services/skill';

import { SkillPageClient } from './skill-page-client';

export default async function SkillsPage() {
  const ctx = await getAuthContext();

  const [result, categories, departments] = await Promise.all([
    listSkills(ctx, { page: 1, perPage: 50 }),
    getCategories(ctx),
    getDepartmentsForOrg(ctx),
  ]);

  return (
    <SkillPageClient
      initialSkills={result.skills}
      initialTotal={result.total}
      categories={categories}
      departments={departments}
    />
  );
}
