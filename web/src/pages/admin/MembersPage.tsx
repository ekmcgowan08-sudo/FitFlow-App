import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMembers } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { Member } from '../../api/types';
import { Card, EmptyState, ErrorBanner, PageHeader, Pagination, Spinner } from '../../components/ui';

const PAGE_SIZE = 20;

export function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    listMembers(page, PAGE_SIZE)
      .then((res) => {
        setMembers(res.members);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load members.'))
      .finally(() => setIsLoading(false));
  }, [page]);

  return (
    <div>
      <PageHeader title="Members" description="Every registered account on the platform." />
      <ErrorBanner message={error} />
      {isLoading ? (
        <Spinner />
      ) : members.length === 0 ? (
        <EmptyState message="No members found." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/admin/members/${member.id}`} className="font-medium text-brand-700 hover:underline">
                      {member.profile?.firstName
                        ? `${member.profile.firstName} ${member.profile.lastName ?? ''}`.trim()
                        : '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{member.email}</td>
                  <td className="px-4 py-3 text-slate-600">{member.status}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(member.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
