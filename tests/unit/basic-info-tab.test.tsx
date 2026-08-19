import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BasicInfoTab } from '@/app/(dashboard)/employees/[id]/tabs/basic-info-tab';
import type { EmployeeDetail } from '@/types/employee';

// Service Layer は閲覧権限が無いフィールドを null にマスクして返す（employee.ts の
// canReadBirthDate / canReadPersonalData）。マスクされた値がそのまま流れてきても
// 画面が落ちず「—」で表示されることを、この画面側で担保する。
function makeEmployee(overrides: Partial<EmployeeDetail> = {}): EmployeeDetail {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    employeeCode: 'E-001',
    fullName: '山田 太郎',
    fullNameKana: 'ヤマダ タロウ',
    email: 'yamada@example.com',
    position: 'エンジニア',
    departmentId: '22222222-2222-2222-2222-222222222222',
    departmentName: '開発部',
    hiredOn: '2020-04-01',
    status: 'active',
    avatarPath: null,
    createdAt: new Date('2020-04-01T00:00:00Z'),
    birthDate: '1990-01-23',
    userId: null,
    updatedAt: new Date('2020-04-01T00:00:00Z'),
    ...overrides,
  };
}

/** 定義リストから、指定したラベルに対応する値のテキストを取り出す */
function valueOf(label: string): string {
  const dt = screen.getByText(label);
  const dd = dt.nextElementSibling;
  expect(dd).not.toBeNull();
  return dd!.textContent ?? '';
}

describe('BasicInfoTab', () => {
  it('全フィールドが埋まっているとき、それぞれの値を表示する', () => {
    render(<BasicInfoTab employee={makeEmployee()} />);

    expect(valueOf('社員番号')).toBe('E-001');
    expect(valueOf('氏名')).toBe('山田 太郎');
    expect(valueOf('フリガナ')).toBe('ヤマダ タロウ');
    expect(valueOf('メールアドレス')).toBe('yamada@example.com');
    expect(valueOf('部署')).toBe('開発部');
    expect(valueOf('役職')).toBe('エンジニア');
    expect(valueOf('入社日')).toBe('2020-04-01');
    expect(valueOf('生年月日')).toBe('1990-01-23');
  });

  it('生年月日がマスクされて null で渡ってきても落ちず「—」を表示する', () => {
    render(<BasicInfoTab employee={makeEmployee({ birthDate: null })} />);

    expect(valueOf('生年月日')).toBe('—');
    // マスクは生年月日だけに効き、他のフィールドは巻き添えにならない
    expect(valueOf('氏名')).toBe('山田 太郎');
  });

  it('null 許容フィールドが全て null でも全ラベルを描画し「—」で埋める', () => {
    render(
      <BasicInfoTab
        employee={makeEmployee({
          fullNameKana: null,
          email: null,
          departmentName: null,
          position: null,
          hiredOn: null,
          birthDate: null,
        })}
      />,
    );

    for (const label of ['フリガナ', 'メールアドレス', '部署', '役職', '入社日', '生年月日']) {
      expect(valueOf(label)).toBe('—');
    }
  });

  it('空文字も未設定として「—」で表示する', () => {
    render(<BasicInfoTab employee={makeEmployee({ position: '' })} />);

    expect(valueOf('役職')).toBe('—');
  });

  it('3つのステータスをそれぞれ日本語バッジで表示する', () => {
    for (const [status, label] of [
      ['active', '在籍'],
      ['inactive', '休職'],
      ['retired', '退職'],
    ] as const) {
      const { unmount } = render(<BasicInfoTab employee={makeEmployee({ status })} />);
      expect(valueOf('ステータス')).toBe(label);
      unmount();
    }
  });
});
