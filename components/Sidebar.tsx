'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  BarChart3,
  Settings,
  Barcode,
  ShieldCheck,
  Receipt,
  FileBarChart,
  ArrowLeftRight,
  Scan,
  IndianRupee,
  Sparkles,
  Briefcase,
  BookOpen,
  Building2,
  Users,
  ScrollText,
  ChevronDown,
  LogOut,
  X,
} from 'lucide-react'
import { can, getCurrentUser, isActiveWarehouse } from '@/lib/rbac'
import type { AuthUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import SyncStatus from '@/components/SyncStatus'
import StoreSwitcher from '@/components/StoreSwitcher'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  user?: { name?: string; role?: string } | null
  onLogout?: () => void
}

type LeafItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

type GroupItem = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  basePath: string
  children: LeafItem[]
}

type MenuEntry = LeafItem | GroupItem

function isGroup(item: MenuEntry): item is GroupItem {
  return 'children' in item
}

export default function Sidebar({ isOpen, onClose, user, onLogout }: SidebarProps) {
  const pathname = usePathname()
  const [me, setMe] = useState<AuthUser | null>(null)
  useEffect(() => setMe(getCurrentUser()), [])

  // Warehouse mode — the active branch is a stock-holding warehouse, not a
  // retail store. Hides POS / Sales / Warranties / GST / Party Settlement
  // (no customers to bill) and reframes the dashboard around inbound and
  // outbound stock movement.
  const warehouseMode = isActiveWarehouse(me)

  // Org-level admin sidebar = anything that needs admin/manager mindset.
  // We deliberately *exclude* transfers from this gate because cashiers have
  // transfer rights but shouldn't see the rest of the admin section — they
  // get a "Stock transfers" link under Inventory instead.
  const showOrgNav = can(me, 'users', 'read') || can(me, 'audit', 'read') || can(me, 'store', 'create')
  const showStoreCreate = can(me, 'store', 'create')
  // Accounting / GST screens are HQ-only when standing in a warehouse —
  // warehouses don't bill customers, so GST returns and party-settlement
  // workflows would be empty noise. Books / ledger stay visible because
  // warehouses still incur GRN-driven ledger entries.
  const showAccounting =
    !warehouseMode && (can(me, 'accounting', 'read') || can(me, 'gst', 'read'))
  const showInsights = can(me, 'reports', 'read') || can(me, 'accounting', 'read') || can(me, 'payroll', 'read')
  const showSettings = can(me, 'store', 'update') || can(me, 'org', 'update')

  // Operational visibility — hides the floor-level day-to-day links from
  // accountants and CAs, who deal in books, not stock or the till. In
  // warehouse mode, the POS / sales surfaces disappear entirely.
  const showPos = !warehouseMode && can(me, 'sales', 'create')
  const showSalesHistory = !warehouseMode && can(me, 'sales', 'read')
  const showPurchases = can(me, 'purchases', 'read')
  const showPurchaseCreate = can(me, 'purchases', 'create')
  const showInventoryStock = can(me, 'inventory', 'read') || can(me, 'products', 'read')
  const showWarranties = !warehouseMode && can(me, 'sales', 'create') // warranties follow sales
  const showInventoryGroup = showInventoryStock || showWarranties || can(me, 'transfers', 'read')

  const menuItems: MenuEntry[] = useMemo(
    () => [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      ...(showPos ? [{ label: 'POS / Billing', href: '/dashboard/pos', icon: Barcode } as LeafItem] : []),
      ...(showSalesHistory ? [{ label: 'Sales History', href: '/dashboard/sales', icon: ShoppingCart } as LeafItem] : []),
      ...(showInventoryGroup
        ? [{
            label: 'Inventory',
            icon: Package,
            basePath: '/dashboard/inventory',
            children: [
              ...(showInventoryStock ? [{ label: 'Stock', href: '/dashboard/inventory', icon: Package }] : []),
              ...(showInventoryStock
                ? [{ label: 'HSN audit', href: '/dashboard/inventory/hsn-audit', icon: ScrollText }]
                : []),
              ...(showWarranties ? [{ label: 'Warranties', href: '/dashboard/warranties', icon: ShieldCheck }] : []),
              ...(can(me, 'transfers', 'read')
                ? [{ label: 'Stock transfers', href: '/dashboard/transfers', icon: ArrowLeftRight }]
                : []),
            ],
          } as GroupItem]
        : []),
      ...(showPurchases
        ? [{
            label: 'Purchases',
            icon: Truck,
            basePath: '/dashboard/purchases',
            children: [
              { label: 'Purchase Orders', href: '/dashboard/purchases', icon: Truck },
              ...(showPurchaseCreate
                ? [{ label: 'Scan Bill (OCR)', href: '/dashboard/scan-bill', icon: Scan }]
                : []),
            ],
          } as GroupItem]
        : []),
      ...(showAccounting
        ? [{
            label: 'Accounting',
            icon: BarChart3,
            basePath: '/dashboard/accounting',
            children: [
              ...(can(me, 'accounting', 'read') ? [{ label: 'Books', href: '/dashboard/accounting', icon: BarChart3 }] : []),
              ...(can(me, 'accounting', 'read') ? [{ label: 'Account Ledger', href: '/dashboard/ledger', icon: BookOpen }] : []),
              ...(can(me, 'accounting', 'read') ? [{ label: 'Expenses', href: '/dashboard/expenses', icon: IndianRupee }] : []),
              ...(can(me, 'accounting', 'read') ? [{ label: 'Party Settlement', href: '/dashboard/party-settlement', icon: ArrowLeftRight }] : []),
              ...(can(me, 'gst', 'read') ? [{ label: 'GST Returns', href: '/dashboard/gst', icon: Receipt }] : []),
              ...(can(me, 'reports', 'read') ? [{ label: 'Reports', href: '/dashboard/reports', icon: FileBarChart }] : []),
            ],
          } as GroupItem]
        : []),
      ...(showInsights
        ? [{
            label: 'Insights',
            icon: Sparkles,
            basePath: '/dashboard/insights',
            children: [
              ...(can(me, 'reports', 'read') ? [{ label: 'Overview', href: '/dashboard/insights', icon: Sparkles }] : []),
              ...(can(me, 'accounting', 'read') ? [{ label: 'Collections', href: '/dashboard/collections', icon: IndianRupee }] : []),
              ...(can(me, 'payroll', 'read') ? [{ label: 'Payroll', href: '/dashboard/payroll', icon: Briefcase }] : []),
            ],
          } as GroupItem]
        : []),
      // Org-level admin section — branches / users / audit. Transfers moved
      // to the Inventory group above so cashiers reach it without seeing
      // this admin-flavoured area.
      ...(showOrgNav
        ? [{
            label: 'Organisation',
            icon: Building2,
            basePath: '/dashboard/branches',
            children: [
              ...(showStoreCreate ? [{ label: 'Branches', href: '/dashboard/branches', icon: Building2 }] : []),
              ...(can(me, 'users', 'read') ? [{ label: 'Users & access', href: '/dashboard/users', icon: Users }] : []),
              ...(can(me, 'audit', 'read') ? [{ label: 'Audit log', href: '/dashboard/audit', icon: ScrollText }] : []),
            ],
          } as GroupItem]
        : []),
      // Billing lives as a tab inside Settings (Settings → Billing) so
      // there's a single account-management surface. The standalone
      // /dashboard/billing route still works (redirects into the tab)
      // for any deeplinks already in the wild.
      ...(showSettings
        ? [{ label: 'Settings', href: '/dashboard/settings', icon: Settings } as LeafItem]
        : []),
    ],
    [me, warehouseMode, showOrgNav, showStoreCreate, showAccounting, showInsights, showSettings,
     showPos, showSalesHistory, showInventoryGroup, showInventoryStock, showWarranties,
     showPurchases, showPurchaseCreate],
  )

  const isPathActive = (href: string) =>
    href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname === href || pathname.startsWith(href + '/')

  const groupHasActiveChild = (group: GroupItem) =>
    group.children.some((c) => isPathActive(c.href))

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const item of menuItems) {
      if (isGroup(item)) initial[item.label] = groupHasActiveChild(item)
    }
    return initial
  })

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }))

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed lg:static left-0 top-0 h-screen w-52 bg-card border-r border-border z-50 lg:z-0 transition-transform duration-200 flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <Image
              src="/Radsting.svg"
              alt="Radsting"
              width={26}
              height={26}
              priority
            />
            <div className="min-w-0">
              <h1 className="font-bold text-sm leading-tight truncate">Radsting</h1>
              <p className="text-[9px] text-muted-foreground leading-tight">POS &amp; ERP</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="lg:hidden h-7 w-7"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="px-2 pt-2">
          <StoreSwitcher />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon

            if (!isGroup(item)) {
              const active = isPathActive(item.href)
              return (
                <Link key={item.href} href={item.href} onClick={onClose}>
                  <Button
                    variant={active ? 'default' : 'ghost'}
                    className={cn(
                      'w-full justify-start gap-2 h-8 px-2 text-[13px]',
                      active && 'bg-blue-600 hover:bg-blue-700'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Button>
                </Link>
              )
            }

            const hasActive = groupHasActiveChild(item)
            const baseActive = isPathActive(item.basePath)
            const expanded = !!openGroups[item.label]

            return (
              <div key={item.label}>
                <div
                  className={cn(
                    'flex items-center rounded-md',
                    baseActive
                      ? 'bg-blue-600 text-white'
                      : hasActive
                        ? 'text-blue-600 font-medium hover:bg-accent'
                        : 'hover:bg-accent'
                  )}
                >
                  <Link
                    href={item.basePath}
                    onClick={onClose}
                    className="flex-1 flex items-center gap-2 h-8 px-2 text-[13px] min-w-0"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left truncate">{item.label}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.label)}
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.label}`}
                    className={cn(
                      'h-8 w-7 flex items-center justify-center rounded-r-md shrink-0',
                      baseActive ? 'hover:bg-blue-700' : 'hover:bg-accent-foreground/10'
                    )}
                  >
                    <ChevronDown
                      className={cn(
                        'w-3.5 h-3.5 transition-transform',
                        expanded ? 'rotate-0' : '-rotate-90'
                      )}
                    />
                  </button>
                </div>

                {expanded && (
                  <div className="ml-2 pl-2 mt-0.5 mb-0.5 border-l border-border space-y-0.5">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon
                      const active = isPathActive(child.href)
                      return (
                        <Link key={child.href} href={child.href} onClick={onClose}>
                          <Button
                            variant={active ? 'default' : 'ghost'}
                            size="sm"
                            className={cn(
                              'w-full justify-start gap-2 h-7 px-2 text-[12px] font-normal',
                              active && 'bg-blue-600 hover:bg-blue-700 text-white'
                            )}
                          >
                            <ChildIcon className="w-3 h-3 shrink-0" />
                            <span className="truncate">{child.label}</span>
                          </Button>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="px-2 py-2 border-t border-border space-y-1.5">
          <SyncStatus />
          {user ? (
            <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium truncate leading-tight">{user.name || 'User'}</p>
                {user.role ? (
                  <span className="inline-block mt-0.5 text-[9px] uppercase tracking-wide bg-blue-600/20 text-blue-600 px-1 py-px rounded">
                    {user.role}
                  </span>
                ) : null}
              </div>
              {onLogout ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onLogout}
                  title="Logout"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  )
}
